const Donation = require('../models/Donation');

// @desc    Create a new donation
// @route   POST /api/donations
exports.createDonation = async (req, res) => {
    try {
        const donation = new Donation(req.body);
        await donation.save();
        res.status(201).json({
            success: true,
            message: 'Donation recorded successfully',
            data: donation,
            receipt: donation.receiptNumber
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get all donations (Admin)
// @route   GET /api/donations
exports.getAllDonations = async (req, res) => {
    try {
        const donations = await Donation.find()
            .sort({ createdAt: -1 })
            .limit(parseInt(req.query.limit) || 100);
        res.json({
            success: true,
            count: donations.length,
            data: donations
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get donation statistics
// @route   GET /api/donations/stats
exports.getDonationStats = async (req, res) => {
    try {
        const totalAmount = await Donation.aggregate([
            { $match: { paymentStatus: 'Success' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayDonations = await Donation.countDocuments({
            createdAt: { $gte: today },
            paymentStatus: 'Success'
        });

        res.json({
            success: true,
            data: {
                totalDonations: await Donation.countDocuments(),
                totalAmount: totalAmount[0]?.total || 0,
                todayDonations,
                pendingDonations: await Donation.countDocuments({ paymentStatus: 'Pending' })
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Update donation status (Admin)
// @route   PUT /api/donations/:id
exports.updateDonation = async (req, res) => {
    try {
        const donation = await Donation.findByIdAndUpdate(
            req.params.id,
            { 
                ...req.body,
                updatedAt: Date.now()
            },
            { new: true, runValidators: true }
        );
        
        if (!donation) {
            return res.status(404).json({
                success: false,
                message: 'Donation not found'
            });
        }
        
        res.json({
            success: true,
            data: donation
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};