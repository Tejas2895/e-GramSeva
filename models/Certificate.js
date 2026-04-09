const mongoose = require('mongoose');

const CertificateSchema = new mongoose.Schema({
    citizen: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', // Ye aapke User model se link karega
        required: true 
    },
    type: { 
        type: String, 
        enum: ['Birth Certificate', 'Death Certificate', 'Income Certificate', 'Domicile Certificate'], 
        required: true 
    },
    reason: { type: String, required: true },
    status: { 
        type: String, 
        default: 'Pending', 
        enum: ['Pending', 'Approved', 'Rejected'] 
    },
    issuedFile: { type: String }, // Cloudinary ka link approve hone ke baad
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Certificate', CertificateSchema);