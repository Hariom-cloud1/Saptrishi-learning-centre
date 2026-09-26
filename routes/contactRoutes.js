const express = require('express');
const router = express.Router();
const { 
    submitContact, 
    getAllContacts, 
    replyContact 
} = require('../controllers/contactController');
const { protect, adminOnly } = require('../middleware/auth');

// Public routes
router.post('/', submitContact);

// Admin routes
router.get('/', protect, adminOnly, getAllContacts);
router.put('/:id/reply', protect, adminOnly, replyContact);

module.exports = router;