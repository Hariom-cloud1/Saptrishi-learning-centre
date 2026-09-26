const Contact = require('../models/Contact');
const nodemailer = require('nodemailer');

// @desc    Submit contact form
// @route   POST /api/contact
exports.submitContact = async (req, res) => {
    try {
        const contact = new Contact(req.body);
        await contact.save();
        
        // Send email notification (optional)
        // await sendContactEmail(contact);
        
        res.status(201).json({
            success: true,
            message: 'Your message has been sent. We will get back to you soon!',
            data: contact
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Get all contacts (Admin)
// @route   GET /api/contact
exports.getAllContacts = async (req, res) => {
    try {
        const contacts = await Contact.find()
            .sort({ createdAt: -1 })
            .limit(parseInt(req.query.limit) || 100);
        res.json({
            success: true,
            count: contacts.length,
            data: contacts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// @desc    Reply to contact (Admin)
// @route   PUT /api/contact/:id/reply
exports.replyContact = async (req, res) => {
    try {
        const { reply } = req.body;
        if (!reply) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a reply'
            });
        }
        
        const contact = await Contact.findByIdAndUpdate(
            req.params.id,
            {
                reply,
                status: 'Replied',
                repliedBy: req.user?.name || 'Admin',
                updatedAt: Date.now()
            },
            { new: true }
        );
        
        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'Contact not found'
            });
        }
        
        // Send reply email (optional)
        // await sendReplyEmail(contact);
        
        res.json({
            success: true,
            message: 'Reply sent successfully',
            data: contact
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};