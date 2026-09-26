const express = require('express');
const router = express.Router();
const { 
    login, 
    getDashboardStats, 
    setupAdmin 
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

// Public routes
router.post('/login', login);
router.post('/setup', setupAdmin);

// Protected routes
router.get('/stats', protect, adminOnly, getDashboardStats);

module.exports = router;