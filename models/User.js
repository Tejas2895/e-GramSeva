const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    // Example in User.js
mobile: String,
address: String,
profilePic: String,
panchayatName: String,
    designation: String,
    role: { type: String, enum: ['user', 'panchayat'], default: 'user' }
    
});

module.exports = mongoose.model('User', UserSchema);