const Volunteer = require('../models/Volunteer');

// @desc    Register as volunteer
// @route   POST /api/volunteers
exports.registerVolunteer = async (req, res) => {
    try {
        const volunteer = new Volunteer(req.body);
        await volunteer.save();
        res.status(201).json({
            success: true,
            message: 'Volunteer registration successful! We will contact you soon.',
            data: volunteer
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get all volunteers (Admin)
// @route   GET /api/volunteers
exports.getAllVolunteers = async (req, res) => {
    try {
        const volunteers = await Volunteer.find()
            .sort({ joinedAt: -1 })
            .limit(parseInt(req.query.limit) || 100);
        res.json({
            success: true,
            count: volunteers.length,
            data: volunteers
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Update volunteer status (Admin)
// @route   PUT /api/volunteers/:id
exports.updateVolunteer = async (req, res) => {
    try {
        const volunteer = await Volunteer.findByIdAndUpdate(
            req.params.id,
            { 
                ...req.body,
                updatedAt: Date.now()
            },
            { new: true, runValidators: true }
        );
        
        if (!volunteer) {
            return res.status(404).json({
                success: false,
                message: 'Volunteer not found'
            });
        }
        
        res.json({
            success: true,
            data: volunteer
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};