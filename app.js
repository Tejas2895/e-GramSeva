process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// --- 1. DEPENDENCIES ---
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const session = require('express-session');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// --- 2. MODELS ---
const User = require('./models/User');
const Complaint = require('./models/Complaint');
const News = require('./models/News'); 
const Certificate = require('./models/Certificate');
const Scheme = require('./models/Scheme');

const app = express();
const PORT = process.env.PORT || 3000;

// --- 3. CLOUDINARY CONFIG ---
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

// --- 4. DATABASE CONNECTION ---
const uri = "mongodb+srv://tejastulaskar0_db_user:Tejas%401234@cluster0.gurjxzf.mongodb.net/egramseva?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(uri)
    .then(() => console.log("Database Connection Established ✅"))
    .catch((error) => console.error("❌ Database Connection Error:", error.message));

// --- 5. MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'eGramSeva_Super_Secret_Key',
    resave: false,
    saveUninitialized: true
}));

// --- 6. EMAIL TRANSPORTER ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'tejastulaskar0@gmail.com',
        pass: 'pgbk unwg dwfk fzux' 
    }
});

// --- 7. ROUTES ---

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

// SIGNUP LOGIC
app.post('/auth/signup', async (req, res) => {
    try {
        let { name, email, password, role } = req.body;
        if (!role || role === 'user') role = 'citizen';

        let isApproved = (role === 'panchayat');

        const newUser = new User({
            name, email, password,
            role: role,
            isApproved: isApproved
        });

        await newUser.save();
        const message = isApproved 
            ? "Your Administrative account is active. Log in now." 
            : "Your account is awaiting verification from the Panchayat Office.";

        res.send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#f0f4f8; min-height:100vh;">
                <div style="background:white; padding:40px; border-radius:15px; box-shadow:0 15px 35px rgba(0,0,0,0.1); display:inline-block;">
                    <h2 style="color: #2d6a4f;">Registration Successful! ✅</h2>
                    <p>${message}</p>
                    <a href="/login" style="background:#2d6a4f; color:white; padding:12px 30px; text-decoration:none; border-radius:8px; display:inline-block; margin-top:20px;">Return to Login</a>
                </div>
            </div>
        `);
    } catch (err) { res.status(500).send("Registration Error: " + err.message); }
});

//  LOGIN LOGIC
app.post('/auth/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        const user = await User.findOne({ email, password, role });
        
        if (user) {
            if (user.role === 'citizen' && !user.isApproved) {
                return res.send("<div style='text-align:center; margin-top:100px;'><h2>⛔ Access Restricted</h2><p>Wait for Admin Approval.</p><a href='/login'>Go Back</a></div>");
            }
            req.session.userId = user._id;
            req.session.user = user;
            req.session.role = user.role;
            res.redirect(user.role === 'panchayat' ? '/panchayat/dashboard' : '/user/dashboard');
        } else { 
            res.send("Authentication Failed. Check credentials."); 
        }
    } catch (err) { res.status(500).send("Error Logging In."); }
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
    } catch (err) { res.status(500).send("Error loading User Dashboard."); }
});

app.get('/panchayat/dashboard', async (req, res) => {
    if (!req.session.userId || req.session.role !== 'panchayat') return res.redirect('/login');
    try {
        const complaints = await Complaint.find().populate('citizen').sort({ createdAt: -1 });
        const news = await News.find().sort({ createdAt: -1 }); 
        const certRequests = await Certificate.find({ status: 'Pending' }).populate('citizen');
        const schemes = await Scheme.find().sort({ updatedAt: -1 });
        const pendingUsers = await User.find({ role: 'citizen', isApproved: false });
        res.render('panchayat-dash', { user: req.session.user, complaints, news, certRequests, schemes, pendingUsers });
    } catch (err) { res.status(500).send("Error loading Panchayat Dashboard."); }
});

// C. ADMIN ACTIONS (User Management)
app.post('/admin/approve-user/:id', async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { isApproved: true });
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Approval Failed"); }
});

app.post('/admin/reject-user/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Rejection Failed"); }
});

// D. GRIEVANCE MANAGEMENT (WITH LOCATION FIX)
app.post('/complaints/add', upload.single('complaintImage'), async (req, res) => {
    try {
        const { category, description, latitude, longitude } = req.body;
        let imageUrl = req.file ? req.file.path : null;
        
        let aiPriority = "Normal";
        const urgentWords = ["broken", "leakage", "emergency", "flood", "dark", "accident", "danger", "urgent", "leak"];
        if (urgentWords.some(word => description.toLowerCase().includes(word))) aiPriority = "High";

        const newComp = new Complaint({
            citizen: req.session.userId,
            category, 
            description, 
            imageUrl, 
            aiPriority,
            latitude: latitude || null,
            longitude: longitude || null
        });
        
        await newComp.save();
        res.redirect('/user/dashboard');
    } catch (err) { 
        console.error(err);
        res.status(500).send("Complaint Submission Error"); 
    }
});

app.post('/complaints/update/:id', async (req, res) => {
    try {
        const { status } = req.body;
        await Complaint.findByIdAndUpdate(req.params.id, { status });
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Status Update Failed"); }
});

app.post('/complaints/delete/:id', async (req, res) => {
    try {
        await Complaint.findByIdAndDelete(req.params.id);
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Deletion Failed"); }
});

// E. PROFILE & SETTINGS 
app.post('/user/update', upload.single('profilePic'), async (req, res) => {
    try {
        const { name, designation, mobile, address, panchayatName } = req.body;
        
        
        const user = await User.findById(req.session.userId);
        if (!user) return res.status(404).send("User not found");

        user.name = name || user.name;
        user.designation = designation || user.designation;
        user.mobile = mobile || user.mobile;
        user.address = address || user.address;
        user.panchayatName = panchayatName || user.panchayatName;

        
        if (req.file && req.file.path) {
            user.profilePic = req.file.path; 
        }
        
       
        const updatedUser = await user.save();

       
        req.session.user = updatedUser;

        
        res.redirect(updatedUser.role === 'panchayat' ? '/panchayat/dashboard' : '/user/dashboard');

    } catch (err) { 
        console.error("Profile Update Error Trace:", err);
        res.status(500).send("Profile Update Error: " + err.message); 
    }
});

// F. NEWS & SCHEMES
app.post('/admin/post-news', async (req, res) => {
    try { 
        await new News(req.body).save(); 
        res.redirect('/panchayat/dashboard'); 
    } catch (err) { res.status(500).send("News Post Failed"); }
});

app.post('/admin/add-scheme', async (req, res) => {
    try { 
        await Scheme.create(req.body); 
        res.redirect('/panchayat/dashboard'); 
    } catch (err) { res.status(500).send("Scheme Posting Failed"); }
});

// G. CERTIFICATE SERVICES
app.post('/certificates/request', async (req, res) => {
    try {
        const { type, reason } = req.body;
        await Certificate.create({ citizen: req.session.userId, type, reason });
        res.redirect('/user/dashboard');
    } catch (err) { res.status(500).send("Request Failed"); }
});

app.post('/admin/certificate/approve/:id', upload.single('certFile'), async (req, res) => {
    try {
        await Certificate.findByIdAndUpdate(req.params.id, { 
            status: 'Approved', 
            issuedFile: req.file.path 
        });
        res.redirect('/panchayat/dashboard');
    } catch (err) { res.status(500).send("Issuance Failed"); }
});

app.post('/admin/certificate/reject/:id', async (req, res) => {
    try { 
        await Certificate.findByIdAndUpdate(req.params.id, { status: 'Rejected' }); 
        res.redirect('/panchayat/dashboard'); 
    } catch (err) { res.status(500).send("Rejection Failed"); }
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.listen(PORT, () => console.log(`🚀 e-GramSeva Server active on port ${PORT}`));