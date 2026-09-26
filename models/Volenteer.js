const mongoose = require('mongoose');

const volunteerSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: [true, 'Please provide full name'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Please provide email'],
        trim: true,
        lowercase: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    phone: {
        type: String,
        required: [true, 'Please provide phone number'],
        trim: true
    },
    age: {
        type: Number,
        min: [16, 'Minimum age is 16'],
        max: [80, 'Maximum age is 80']
    },
    address: {
        type: String,
        trim: true
    },
    city: {
        type: String,
        trim: true
    },
    state: {
        type: String,
        trim: true
    },
    pincode: {
        type: String,
        trim: true
    },
    availability: {
        type: String,
        enum: ['Weekdays', 'Weekends', 'Both', 'Flexible'],
        default: 'Flexible'
    },
    skills: [{
        type: String,
        enum: ['Teaching', 'Counseling', 'Event Management', 'Fundraising', 
               'Social Media', 'Content Writing', 'Design', 'Photography', 
               'Medical', 'Legal', 'Other']
    }],
    otherSkills: {
        type: String,
        trim: true
    },
    experience: {
        type: String,
        trim: true
    },
    motivation: {
        type: String,
        required: [true, 'Please tell us why you want to volunteer'],
        maxlength: [1000, 'Motivation cannot exceed 1000 characters']
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Active', 'Inactive', 'Rejected'],
        default: 'Pending'
    },
    assignedTasks: [{
        type: String,
        trim: true
    }],
    joinedAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

volunteerSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Volunteer', volunteerSchema);