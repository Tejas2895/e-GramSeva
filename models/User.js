const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    
    // ✅ Status & Role (Main Logic)
    isApproved: { type: Boolean, default: false },
    role: { 
        type: String, 
        enum: ['citizen', 'panchayat'], 
        default: 'citizen' 
    },

    // ✅ Profile Details
    mobile: { type: String, default: '' },
    address: { type: String, default: '' },
    profilePic: { type: String, default: '' },
    
    // ✅ Office Details
    panchayatName: { type: String, default: '' },
    designation: { type: String, default: '' }
    
}, { timestamps: true }); 
module.exports = mongoose.model('User', UserSchema);