const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    isApproved: { type: Boolean, default: false },
    mobile: { type: String, default: '' },
    address: { type: String, default: '' },
    profilePic: { type: String, default: '' },
    panchayatName: { type: String, default: '' },
    designation: { type: String, default: '' },
    
    // ✅ FIX YAHAN HAI: Default ko 'citizen' karo aur enum ke sath match rakho
    role: { 
        type: String, 
        enum: ['citizen', 'panchayat'], 
        default: 'citizen' 
    }
});

module.exports = mongoose.model('User', UserSchema);