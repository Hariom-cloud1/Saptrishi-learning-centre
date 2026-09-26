const express = require('express');
const router = express.Router();
const { 
    registerVolunteer, 
    getAllVolunteers, 
    updateVolunteer 
} = require('../controllers/volunteerController');
const { protect, adminOnly } = require('../middleware/auth');

// Public routes
router.post('/', registerVolunteer);

// Admin routes
router.get('/', protect, adminOnly, getAllVolunteers);
router.put('/:id', protect, adminOnly, updateVolunteer);

module.exports = router;