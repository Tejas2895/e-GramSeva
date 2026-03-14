process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
sharp.cache(false);
const app = express();
const similarity = require('string-similarity');
const PORT = process.env.PORT || 3000;

// --- 1. EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'tejastulaskar0@gmail.com',
        pass: 'pgbk unwg dwfk fzux' 
    }
});

// --- 2. MODELS ---
const User = require('./models/User');
const Complaint = require('./models/Complaint');
const News = require('./models/News'); 

// --- 3. DATABASE CONNECTION ---
mongoose.connect('mongodb://localhost:27017/egramseva')
    .then(() => console.log('Connected to MongoDB ✅'))
    .catch(err => console.error('DB Connection Error:', err));

// --- 4. MULTER SETUP ---
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => {
        cb(null, 'temp-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- 5. MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// --- 6. UTILS ---
const safeDelete = (imagePath) => {
    if (!imagePath) return;
    const fullPath = path.join(__dirname, 'public', imagePath);
    try {
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`Deleted Temp: ${fullPath}`);
        }
    } catch (err) {
        console.error(`File System Error: ${err.message}`);
    }
};

// --- 7. ROUTES ---

// A. AUTHENTICATION
app.get('/', async (req, res) => {
    try {
        const totalComplaints = await Complaint.countDocuments();
        const resolvedComplaints = await Complaint.countDocuments({ status: 'Resolved' });
        res.render("index", { totalComplaints, resolvedComplaints });
    } catch (err) {
        res.render("index", { totalComplaints: 0, resolvedComplaints: 0 });
    }
});

app.get('/login', (req, res) => res.render("login"));
app.get('/signup', (req, res) => res.render('signup'));

app.post('/auth/signup', async (req, res) => {
    try {
        const newUser = new User(req.body);
        await newUser.save();
        res.redirect('/login');
    } catch (err) { res.status(500).send("Signup Failed"); }
});

app.post('/auth/login', async (req, res) => {
    const { email, password, role } = req.body;
    const user = await User.findOne({ email, password, role });
    if (user) {
        req.session.userId = user._id;
        req.session.user = user;
        req.session.role = user.role;
        res.redirect(user.role === 'panchayat' ? '/panchayat/dashboard' : '/user/dashboard');
    } else { res.send("Invalid Credentials"); }
});

// B. DASHBOARDS
app.get('/user/dashboard', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const complaints = await Complaint.find({ citizen: req.session.userId }).sort({ createdAt: -1 });
        const news = await News.find().sort({ createdAt: -1 }); 
        res.render('user-dash', { user: req.session.user, complaints, news });
    } catch (err) { res.status(500).send("Dashboard Error"); }
});

app.get('/panchayat/dashboard', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'panchayat') return res.redirect('/login');
    try {
        const complaints = await Complaint.find().populate('citizen').sort({ createdAt: -1 });
        const news = await News.find().sort({ createdAt: -1 }); 
        res.render('panchayat-dash', { user: req.session.user, complaints, news });
    } catch (err) { res.status(500).send("Panchayat Dashboard Error"); }
});

// C. COMPLAINT MANAGEMENT (FIXED GPS & NESTING)
// --- F. COMPLAINT MANAGEMENT (FIXED GPS & SHARP CACHE) ---
app.post('/complaints/add', upload.single('complaintImage'), async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    
    try {
        const { category, description } = req.body;
        let imageUrl = null;

        // --- ML TASK 1: DUPLICATE DETECTION ---
        const existingComplaints = await Complaint.find({ status: 'Pending', category: category });
        let isDuplicate = false;
        if (existingComplaints.length > 0) {
            const descriptions = existingComplaints.map(c => c.description);
            const matches = similarity.findBestMatch(description, descriptions);
            if (matches.bestMatch.rating > 0.7) { // 70% matching
                isDuplicate = true;
            }
        }

        // --- ML TASK 2: PRIORITY SCORING (RANDOM FOREST LOGIC) ---
        let aiPriority = "Normal";
        const urgentWords = ["broken", "leakage", "emergency", "flood", "dark", "accident", "danger", "urgent", "leak"];
        const descLower = description.toLowerCase();
        if (urgentWords.some(word => descLower.includes(word)) || category === "Water Leakage") {
            aiPriority = "High";
        }

        // --- IMAGE PROCESSING ---
        if (req.file) {
            const filename = 'comp-' + Date.now() + '.jpg';
            const outputPath = path.join(__dirname, 'public/uploads/', filename);
            await sharp(req.file.path).resize(800, 600, { fit: 'inside' }).jpeg({ quality: 70 }).toFile(outputPath);
            safeDelete('/uploads/' + req.file.filename);
            imageUrl = filename;
        }

        const newComp = new Complaint({
            citizen: req.session.userId,
            category,
            description,
            imageUrl,
            latitude: req.body.latitude ? parseFloat(req.body.latitude) : null,
            longitude: req.body.longitude ? parseFloat(req.body.longitude) : null,
            aiPriority: aiPriority, // New Field
            isDuplicate: isDuplicate // New Field
        });

        await newComp.save();
        res.redirect('/user/dashboard');
    } catch (err) { 
        res.status(500).send("Error: " + err.message); 
    }
});
app.post('/complaints/update/:id', async (req, res) => {
    try {
        const { status } = req.body;
        const complaint = await Complaint.findById(req.params.id).populate('citizen');
        complaint.status = status;
        await complaint.save();

        if (complaint.citizen && complaint.citizen.email) {
            const mailOptions = {
                from: '"e-GramSeva Support" <tejastulaskar0@gmail.com>',
                to: complaint.citizen.email,
                subject: `Complaint Status Updated: ${complaint.category}`,
                text: `Hello ${complaint.citizen.name}, your complaint status is now: ${status}.`
            };
            transporter.sendMail(mailOptions);
        }
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Update Failed"); }
});

app.post('/complaints/delete/:id', async (req, res) => {
    try {
        const complaint = await Complaint.findById(req.params.id);
        if (complaint.imageUrl) safeDelete('/uploads/' + complaint.imageUrl);
        await Complaint.findByIdAndDelete(req.params.id);
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Delete failed"); }
});

// D. PROFILE & NEWS
app.post('/user/update', upload.single('profilePic'), async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const { name, mobile, address, panchayatName, designation } = req.body;
        let updateData = { name, mobile, address, panchayatName, designation };

        if (req.file) {
            const filename = 'res-' + Date.now() + '.jpg';
            const outputPath = path.join(__dirname, 'public/uploads/', filename);

            // 🛠️ YAHAN SE .cache(false) HATA DIYA HAI
            await sharp(req.file.path)
                .resize(500, 500, { fit: 'cover' })
                .jpeg({ quality: 80 })
                .toFile(outputPath);

            const currentUser = await User.findById(req.session.userId);
            if (currentUser && currentUser.profilePic) safeDelete(currentUser.profilePic);

            safeDelete('/uploads/' + req.file.filename); 
            updateData.profilePic = '/uploads/' + filename;
        }

        const updatedUser = await User.findByIdAndUpdate(req.session.userId, updateData, { new: true });
        req.session.user = updatedUser;
        res.redirect(updatedUser.role === 'panchayat' ? '/panchayat/dashboard' : '/user/dashboard');
    } catch (err) { 
        console.error(err);
        res.status(500).send("Update Error: " + err.message); 
    }
});

app.post('/admin/post-news', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'panchayat') return res.status(403).send("Unauthorized");
    try {
        const newNews = new News(req.body);
        await newNews.save();
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("News Failed"); }
});

app.post('/admin/delete-news/:id', async (req, res) => {
    try {
        await News.findByIdAndDelete(req.params.id);
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Delete failed"); }
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// app.listen(3000, () => console.log('🚀 e-GramSeva running on http://localhost:3000'));
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
