const express = require('express');
const router = express.Router();
const { 
    createDonation, 
    getAllDonations, 
    getDonationStats,
    updateDonation 
} = require('../controllers/donationController');
const { protect, adminOnly } = require('../middleware/auth');

// Public routes
router.post('/', createDonation);

// Admin routes
router.get('/', protect, adminOnly, getAllDonations);
router.get('/stats', protect, adminOnly, getDonationStats);
router.put('/:id', protect, adminOnly, updateDonation);

module.exports = router;