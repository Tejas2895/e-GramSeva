const mongoose = require('mongoose');

const ComplaintSchema = new mongoose.Schema({
    citizen: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    category: { type: String, required: true },
    description: String,
    imageUrl: String,
    status: { type: String, default: 'Pending', enum: ['Pending', 'In-Progress', 'Resolved','Rejected'] },
   latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now },
    aiPriority: { 
        type: String, 
        enum: ['High', 'Normal', 'Low'],
        default: 'Normal' 
    },
isDuplicate: { type: Boolean, default: false }
});

module.exports = mongoose.model('Complaint', ComplaintSchema);