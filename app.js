process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const Certificate = require('./models/Certificate');
const Scheme = require('./models/Scheme');
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const session = require('express-session');
const path = require('path');
const similarity = require('string-similarity');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. MODELS ---
const User = require('./models/User');
const Complaint = require('./models/Complaint');
const News = require('./models/News'); 

// --- 2. CLOUDINARY CONFIG ---
cloudinary.config({
  cloud_name: 'dh8mv8nlo',
  api_key: '195988474883287',
  api_secret: '8eNbndWlOFyCvsgl5PjHC2F42gA'
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'eGramSeva_Photos', 
    allowedFormats: ['jpg', 'png', 'jpeg'],
  },
});
const upload = multer({ storage: storage });

// --- 3. DATABASE CONNECTION ---
const uri = "mongodb+srv://tejastulaskar0_db_user:Tejas%401234@cluster0.gurjxzf.mongodb.net/egramseva?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(uri)
  .then(() => console.log("Successfully connected to MongoDB Atlas! ✅"))
  .catch((error) => console.error("❌ Connection error:", error.message));

// --- 4. MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// --- 5. EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'tejastulaskar0@gmail.com',
        pass: 'pgbk unwg dwfk fzux' 
    }
});

// --- 6. ROUTES ---

// A. LANDING PAGE
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

// ✅ UPDATED SIGNUP: Added isApproved: false
app.post('/auth/signup', async (req, res) => {
    try {
        const newUser = new User({
            ...req.body,
            isApproved: false // User must be approved by Panchayat Admin
        });
        await newUser.save();
        res.send("<h2>Signup Successful! ✅</h2><p>Your account is pending for Admin Approval. Please try logging in after some time.</p><a href='/login'>Go to Login</a>");
    } catch (err) { res.status(500).send("Signup Failed: " + err.message); }
});

// ✅ UPDATED LOGIN: Added Approval Check
app.post('/auth/login', async (req, res) => {
    const { email, password, role } = req.body;
    const user = await User.findOne({ email, password, role });
    
    if (user) {
        // Block Citizens who are not yet approved
        if (user.role === 'citizen' && user.isApproved === false) {
            return res.send("⛔ **Access Denied**: Your account is not approved yet by Gram Panchayat Admin.");
        }

        req.session.userId = user._id;
        req.session.user = user;
        req.session.role = user.role;
        res.redirect(user.role === 'panchayat' ? '/panchayat/dashboard' : '/user/dashboard');
    } else { res.send("Invalid Credentials"); }
});

// B. DASHBOARDS

// User Dashboard
app.get('/user/dashboard', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const complaints = await Complaint.find({ citizen: req.session.userId }).sort({ createdAt: -1 });
        const news = await News.find().sort({ createdAt: -1 }); 
        const schemes = await Scheme.find().sort({ updatedAt: -1 });
        const certificates = await Certificate.find({ citizen: req.session.userId }).sort({ createdAt: -1 });

        res.render('user-dash', { 
            user: req.session.user, 
            complaints, 
            news, 
            schemes,      
            certificates  
        });
    } catch (err) { 
        res.status(500).send("Dashboard Error: " + err.message); 
    }
});

// ✅ UPDATED Panchayat Dashboard: Added pendingUsers
app.get('/panchayat/dashboard', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'panchayat') return res.redirect('/login');
    try {
        const complaints = await Complaint.find().populate('citizen').sort({ createdAt: -1 });
        const news = await News.find().sort({ createdAt: -1 }); 
        const certRequests = await Certificate.find({ status: 'Pending' }).populate('citizen');
        const schemes = await Scheme.find().sort({ updatedAt: -1 });
        
        // Fetch users waiting for approval
        const pendingUsers = await User.find({ role: 'citizen', isApproved: false });

        res.render('panchayat-dash', { 
            user: req.session.user, 
            complaints, 
            news, 
            certRequests, 
            schemes,
            pendingUsers // Passing pending users to admin view
        });
    } catch (err) { 
        res.status(500).send("Panchayat Dashboard Error: " + err.message); 
    }
});

// ✅ NEW ROUTE: Approve User Action
app.post('/admin/approve-user/:id', async (req, res) => {
    if (req.session.role !== 'panchayat') return res.status(403).send("Unauthorized");
    try {
        await User.findByIdAndUpdate(req.params.id, { isApproved: true });
        res.redirect('/panchayat/dashboard');
    } catch (err) {
        res.status(500).send("Approval Failed: " + err.message);
    }
});

// C. COMPLAINT MANAGEMENT
app.post('/complaints/add', upload.single('complaintImage'), async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const { category, description } = req.body;
        let imageUrl = req.file ? req.file.path : null;

        const existingComplaints = await Complaint.find({ status: 'Pending', category: category });
        let isDuplicate = false;
        if (existingComplaints.length > 0) {
            const descriptions = existingComplaints.map(c => c.description);
            const matches = similarity.findBestMatch(description, descriptions);
            if (matches.bestMatch.rating > 0.7) isDuplicate = true;
        }

        let aiPriority = "Normal";
        const urgentWords = ["broken", "leakage", "emergency", "flood", "dark", "accident", "danger", "urgent", "leak"];
        const descLower = description.toLowerCase();
        if (urgentWords.some(word => descLower.includes(word)) || category === "Water Leakage") aiPriority = "High";

        const newComp = new Complaint({
            citizen: req.session.userId,
            category,
            description,
            imageUrl, 
            latitude: req.body.latitude ? parseFloat(req.body.latitude) : null,
            longitude: req.body.longitude ? parseFloat(req.body.longitude) : null,
            aiPriority: aiPriority,
            isDuplicate: isDuplicate
        });

        await newComp.save();
        res.redirect('/user/dashboard');
    } catch (err) { res.status(500).send("Error: " + err.message); }
});

// D. ADMIN ACTIONS
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
        await Complaint.findByIdAndDelete(req.params.id);
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Delete failed"); }
});

// E. PROFILE UPDATE
app.post('/user/update', upload.single('profilePic'), async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const { name, mobile, address, panchayatName, designation } = req.body;
        let updateData = { name, mobile, address, panchayatName, designation };
        if (req.file) updateData.profilePic = req.file.path;

        const updatedUser = await User.findByIdAndUpdate(req.session.userId, updateData, { new: true });
        req.session.user = updatedUser;
        res.redirect(updatedUser.role === 'panchayat' ? '/panchayat/dashboard' : '/user/dashboard');
    } catch (err) { res.status(500).send("Update Error: " + err.message); }
});

app.post('/admin/post-news', async (req, res) => {
    try {
        const newNews = new News(req.body);
        await newNews.save();
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("News Failed"); }
});

// F. CERTIFICATES & SCHEMES
app.post('/certificates/request', async (req, res) => {
    const { type, reason } = req.body;
    await Certificate.create({ citizen: req.session.userId, type, reason });
    res.redirect('/user/dashboard');
});

app.post('/admin/add-scheme', async (req, res) => {
    const { name, fundAllocated, status } = req.body;
    await Scheme.create({ name, fundAllocated, status });
    res.redirect('/panchayat/dashboard');
});

app.post('/admin/certificate/approve/:id', upload.single('certFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send("Please upload a file");
        await Certificate.findByIdAndUpdate(req.params.id, {
            status: 'Approved',
            issuedFile: req.file.path
        });
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Approval Failed: " + err.message); }
});

app.post('/admin/certificate/reject/:id', async (req, res) => {
    try {
        await Certificate.findByIdAndUpdate(req.params.id, { status: 'Rejected' });
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Rejection Failed: " + err.message); }
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));