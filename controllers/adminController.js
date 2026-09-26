const User = require('../models/User');
const jwt = require('jsonwebtoken');
const Donation = require('../models/Donation');
const Volunteer = require('../models/Volunteer');
const Contact = require('../models/Contact');

// @desc    Admin login
// @route   POST /api/admin/login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        // Update last login
        user.lastLogin = Date.now();
        await user.save();
        
        // Generate JWT
        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get admin dashboard stats
// @route   GET /api/admin/stats
exports.getDashboardStats = async (req, res) => {
    try {
        const [totalDonations, totalVolunteers, totalContacts, recentDonations] = await Promise.all([
            Donation.countDocuments({ paymentStatus: 'Success' }),
            Volunteer.countDocuments({ status: 'Active' }),
            Contact.countDocuments({ status: 'New' }),
            Donation.find({ paymentStatus: 'Success' })
                .sort({ createdAt: -1 })
                .limit(5)
        ]);
        
        const totalAmount = await Donation.aggregate([
            { $match: { paymentStatus: 'Success' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        res.json({
            success: true,
            data: {
                totalDonations,
                totalAmount: totalAmount[0]?.total || 0,
                totalVolunteers,
                pendingContacts: totalContacts,
                recentDonations
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Create initial admin user
// @route   POST /api/admin/setup
exports.setupAdmin = async (req, res) => {
    try {
        const existingAdmin = await User.findOne({ email: process.env.ADMIN_EMAIL });
        if (existingAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Admin already exists'
            });
        }
        
        const admin = new User({
            name: 'Admin',
            email: process.env.ADMIN_EMAIL,
            password: process.env.ADMIN_PASSWORD,
            role: 'admin'
        });
        
        await admin.save();
        
        res.json({
            success: true,
            message: 'Admin user created successfully',
            data: {
                email: admin.email,
                role: admin.role
            }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};