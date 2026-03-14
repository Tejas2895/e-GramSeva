const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['Alert', 'Scheme', 'Event', 'General'],
        default: 'General'
    },
    createdAt: {
        type: Date,
        default: Date.now,
        // 24 ghante baad apne aap delete ho jayegi (60 sec * 60 min * 24 hours)
        index:  {expires: 86400},
    }
});

module.exports = mongoose.model('News', newsSchema);