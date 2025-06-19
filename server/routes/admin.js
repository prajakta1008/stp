const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken } = require('../middleware/authMiddleware');

// ✅ Define isAdmin middleware locally
function isAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admins only.' });
  }
}

// ✅ GET all users (only admins)
router.get('/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await User.find({});
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ✅ DELETE all users
router.delete('/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    await User.deleteMany({});
    res.json({ message: 'All users deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete users' });
  }
});

// ✅ Promote user to admin
router.put('/users/:id/promote', authenticateToken, isAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { role: 'admin' });
    res.json({ message: 'User promoted to admin.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to promote user.' });
  }
});

// ✅ Demote user to regular
router.put('/users/:id/demote', authenticateToken, isAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { role: 'user' });
    res.json({ message: 'User demoted to regular user.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to demote user.' });
  }
});

module.exports = router;
