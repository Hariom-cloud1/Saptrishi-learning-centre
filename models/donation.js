const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
    donorName: {
        type: String,
        required: [true, 'Please provide donor name'],
        trim: true
    },
    donorEmail: {
        type: String,
        required: [true, 'Please provide email'],
        trim: true,
        lowercase: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    donorPhone: {
        type: String,
        trim: true
    },
    amount: {
        type: Number,
        required: [true, 'Please provide donation amount'],
        min: [1, 'Minimum donation is ₹1']
    },
    currency: {
        type: String,
        default: 'INR'
    },
    paymentMethod: {
        type: String,
        enum: ['UPI', 'Card', 'NetBanking', 'Razorpay', 'Instamojo'],
        default: 'UPI'
    },
    paymentId: {
        type: String,
        unique: true,
        sparse: true
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Success', 'Failed', 'Refunded'],
        default: 'Pending'
    },
    message: {
        type: String,
        trim: true,
        maxlength: [500, 'Message cannot exceed 500 characters']
    },
    isAnonymous: {
        type: Boolean,
        default: false
    },
    receiptNumber: {
        type: String,
        unique: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Generate receipt number before saving
donationSchema.pre('save', function(next) {
    if (!this.receiptNumber) {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        this.receiptNumber = `SR-${year}${month}${day}-${random}`;
    }
    next();
});

module.exports = mongoose.model('Donation', donationSchema);