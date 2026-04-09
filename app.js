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

// ✅ FIXED SIGNUP: Forcing role and isApproved status
app.post('/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const newUser = new User({
            name,
            email,
            password,
            role: 'citizen',    
            isApproved: false  
        });
        await newUser.save();
        res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#f8fafc; min-height:100vh;">
                <div style="background:white; padding:40px; border-radius:20px; display:inline-block; box-shadow:0 10px 25px rgba(0,0,0,0.05);">
                    <h2 style="color: #1a7431;">Signup Successful! ✅</h2>
                    <p style="color: #64748b;">Your account is pending for admin approval.<br>You can log in only after your account has been verified.</p>
                    <a href="/login" style="background:#1a7431; color:white; padding:12px 25px; text-decoration:none; border-radius:10px; display:inline-block; margin-top:20px; font-weight:bold;">Go to Login</a>
                </div>
            </div>
        `);
    } catch (err) { res.status(500).send("Signup Failed: " + err.message); }
});

// ✅ FIXED LOGIN: Strict check for Approval
app.post('/auth/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const user = await User.findOne({ email, password, role });
        
        if (user) {
            // Block Citizens who are not yet approved (null or false)
            if (user.role === 'citizen' && (user.isApproved === false || user.isApproved === undefined)) {
                return res.send(`
                    <div style="text-align:center; margin-top:50px; font-family:sans-serif;">
                        <h2 style="color:#ef4444;">⛔ Access Denied</h2>
                        <p>Your account has not yet been approved by the admin.</p>
                        <a href="/login">Go back.</a>
                    </div>
                `);
            }

            // Grant session if approved or if user is Admin
            req.session.userId = user._id;
            req.session.user = user;
            req.session.role = user.role;
            res.redirect(user.role === 'panchayat' ? '/panchayat/dashboard' : '/user/dashboard');
        } else { 
            res.send("Invalid Credentials. Please check Email/Password/Role."); 
        }
    } catch (err) { res.status(500).send("Login Error"); }
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
    } catch (err) { res.status(500).send("Dashboard Error"); }
});

app.get('/panchayat/dashboard', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'panchayat') return res.redirect('/login');
    try {
        const complaints = await Complaint.find().populate('citizen').sort({ createdAt: -1 });
        const news = await News.find().sort({ createdAt: -1 }); 
        const certRequests = await Certificate.find({ status: 'Pending' }).populate('citizen');
        const schemes = await Scheme.find().sort({ updatedAt: -1 });
        
        // Fetch ALL users where isApproved is strictly false
        const pendingUsers = await User.find({ role: 'citizen', isApproved: false });

        res.render('panchayat-dash', { 
            user: req.session.user, 
            complaints, 
            news, 
            certRequests, 
            schemes,
            pendingUsers 
        });
    } catch (err) { res.status(500).send("Panchayat Dashboard Error"); }
});

// FIXED APPROVE ROUTE: Using POST as per EJS update
app.post('/admin/approve-user/:id', async (req, res) => {
    if (req.session.role !== 'panchayat') return res.status(403).send("Unauthorized");
    try {
        await User.findByIdAndUpdate(req.params.id, { isApproved: true });
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Approval Failed"); }
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
    } catch (err) { res.status(500).send("Complaint Error"); }
});

// D. ADMIN ACTIONS (NEWS, UPDATES, LOGOUT)
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
                subject: `Status Updated: ${complaint.category}`,
                text: `Your complaint status is now: ${status}.`
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
    } catch (err) { res.status(500).send("Update Error"); }
});

app.post('/admin/post-news', async (req, res) => {
    try {
        const newNews = new News(req.body);
        await newNews.save();
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("News Failed"); }
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
    } catch (err) { res.status(500).send("Approval Failed"); }
});

app.post('/admin/certificate/reject/:id', async (req, res) => {
    await Certificate.findByIdAndUpdate(req.params.id, { status: 'Rejected' });
    res.redirect('/panchayat/dashboard');
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));