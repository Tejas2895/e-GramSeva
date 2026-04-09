const mongoose = require('mongoose');

const SchemeSchema = new mongoose.Schema({
    name: { type: String, required: true }, // Scheme ka naam (e.g., Road Repair)
    fundAllocated: { type: String, required: true }, // Kitna paisa aaya (e.g., ₹5,00,000)
    description: { type: String },
     
    status: { 
        type: String, 
        default: 'Announced', 
        enum: ['Announced', 'Ongoing', 'Completed'] 
    },
    dateAdded: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Scheme', SchemeSchema);