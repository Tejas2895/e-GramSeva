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
  .then(() => console.log("Database Connection Established ✅"))
  .catch((error) => console.error("❌ Database Connection Error:", error.message));

// --- 4. MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'eGramSeva_Super_Secret_Key',
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

// ✅ PROFESSIONAL SIGNUP: Logic for Admin Auto-Approval vs Citizen Pending
app.post('/auth/signup', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // Auto-approve Panchayat officers, keep Citizens pending
        let isApproved = false;
        if (role === 'panchayat') {
            isApproved = true; 
        }

        const newUser = new User({
            name,
            email,
            password,
            role: role || 'citizen',
            isApproved: isApproved
        });

        await newUser.save();

        const message = isApproved 
            ? "Your Administrative account is active. You can log in now." 
            : "Your account has been created and is currently awaiting verification from the Panchayat Office.";

        res.send(`
            <div style="font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align:center; padding:50px; background:#f0f4f8; min-height:100vh;">
                <div style="background:white; padding:40px; border-radius:15px; display:inline-block; box-shadow:0 15px 35px rgba(0,0,0,0.1); max-width:500px;">
                    <h2 style="color: #2d6a4f;">Registration Successful! ✅</h2>
                    <p style="color: #4a5568; line-height:1.6;">${message}</p>
                    <hr style="margin:20px 0; border:0; border-top:1px solid #e2e8f0;">
                    <a href="/login" style="background:#2d6a4f; color:white; padding:12px 30px; text-decoration:none; border-radius:8px; display:inline-block; font-weight:600; transition:0.3s;">Return to Login</a>
                </div>
            </div>
        `);
    } catch (err) { 
        console.error(err);
        res.status(500).send("Registration Error: " + err.message); 
    }
});

// ✅ PROFESSIONAL LOGIN: Status Check
app.post('/auth/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const user = await User.findOne({ email, password, role });
        
        if (user) {
            // Block Citizens who are not yet approved
            if (user.role === 'citizen' && !user.isApproved) {
                return res.send(`
                    <div style="text-align:center; margin-top:100px; font-family:sans-serif;">
                        <div style="background:#fff5f5; border:1px solid #feb2b2; color:#c53030; padding:30px; border-radius:12px; display:inline-block;">
                            <h2 style="margin:0;">⛔ Access Restricted</h2>
                            <p>Your account is currently under review by the Gram Panchayat Admin.</p>
                            <a href="/login" style="color:#c53030; font-weight:bold;">Try again later</a>
                        </div>
                    </div>
                `);
            }

            req.session.userId = user._id;
            req.session.user = user;
            req.session.role = user.role;
            res.redirect(user.role === 'panchayat' ? '/panchayat/dashboard' : '/user/dashboard');
        } else { 
            res.send("Authentication Failed. Please verify your credentials and role."); 
        }
    } catch (err) { res.status(500).send("An internal server error occurred."); }
});

// B. DASHBOARDS
app.get('/user/dashboard', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const complaints = await Complaint.find({ citizen: req.session.userId }).sort({ createdAt: -1 });
        const news = await News.find().sort({ createdAt: -1 }); 
        const schemes = await Scheme.find().sort({ updatedAt: -1 });
        const certificates = await Certificate.find({ citizen: req.session.userId }).sort({ createdAt: -1 });

        res.render('user-dash', { user: req.session.user, complaints, news, schemes, certificates });
    } catch (err) { res.status(500).send("Could not load User Dashboard."); }
});

app.get('/panchayat/dashboard', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'panchayat') return res.redirect('/login');
    try {
        const complaints = await Complaint.find().populate('citizen').sort({ createdAt: -1 });
        const news = await News.find().sort({ createdAt: -1 }); 
        const certRequests = await Certificate.find({ status: 'Pending' }).populate('citizen');
        const schemes = await Scheme.find().sort({ updatedAt: -1 });
        const pendingUsers = await User.find({ role: 'citizen', isApproved: false });

        res.render('panchayat-dash', { 
            user: req.session.user, complaints, news, certRequests, schemes, pendingUsers 
        });
    } catch (err) { res.status(500).send("Could not load Panchayat Dashboard."); }
});

// C. ACTIONS
app.post('/admin/approve-user/:id', async (req, res) => {
    if (req.session.role !== 'panchayat') return res.status(403).send("Unauthorized Access");
    try {
        await User.findByIdAndUpdate(req.params.id, { isApproved: true });
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Process Failed"); }
});

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
        if (urgentWords.some(word => description.toLowerCase().includes(word))) aiPriority = "High";

        const newComp = new Complaint({
            citizen: req.session.userId,
            category, description, imageUrl,
            latitude: req.body.latitude || null,
            longitude: req.body.longitude || null,
            aiPriority, isDuplicate
        });

        await newComp.save();
        res.redirect('/user/dashboard');
    } catch (err) { res.status(500).send("Submission Error"); }
});

// ADMIN LOGIC UPDATES
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
                subject: `Grievance Status Update: ${complaint.category}`,
                text: `Dear ${complaint.citizen.name}, your complaint status has been updated to: ${status}.`
            };
            transporter.sendMail(mailOptions);
        }
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Update Failed"); }
});

app.post('/user/update', upload.single('profilePic'), async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const updateData = { ...req.body };
        if (req.file) updateData.profilePic = req.file.path;
        const updatedUser = await User.findByIdAndUpdate(req.session.userId, updateData, { new: true });
        req.session.user = updatedUser;
        res.redirect(updatedUser.role === 'panchayat' ? '/panchayat/dashboard' : '/user/dashboard');
    } catch (err) { res.status(500).send("Profile Update Error"); }
});

app.post('/admin/post-news', async (req, res) => {
    try {
        await new News(req.body).save();
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("News Post Failed"); }
});

app.post('/certificates/request', async (req, res) => {
    const { type, reason } = req.body;
    await Certificate.create({ citizen: req.session.userId, type, reason });
    res.redirect('/user/dashboard');
});

app.post('/admin/add-scheme', async (req, res) => {
    await Scheme.create(req.body);
    res.redirect('/panchayat/dashboard');
});

app.post('/admin/certificate/approve/:id', upload.single('certFile'), async (req, res) => {
    try {
        await Certificate.findByIdAndUpdate(req.params.id, { status: 'Approved', issuedFile: req.file.path });
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Issuance Failed"); }
});

app.post('/admin/certificate/reject/:id', async (req, res) => {
    await Certificate.findByIdAndUpdate(req.params.id, { status: 'Rejected' });
    res.redirect('/panchayat/dashboard');
});

app.post('/admin/reject-user/:id', async (req, res) => {
    // Check if the person is an Admin
    if (!req.session.userId || req.session.role !== 'panchayat') {
        return res.status(403).send("Unauthorized Access");
    }

    try {
        // Find and delete the pending user request
        await User.findByIdAndDelete(req.params.id);
        res.redirect('/panchayat/dashboard');
    } catch (err) {
        res.status(500).send("Rejection Failed: " + err.message);
    }
});
app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.listen(PORT, () => console.log(`🚀 e-GramSeva Server active on port ${PORT}`));