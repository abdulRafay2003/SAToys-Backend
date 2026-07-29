const express = require('express');
const router = express.Router();
const {
  register,
  login,
  verifyOTP,
  forgotPassword,
  resetPassword,
  logout,
  getMe,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/verify-otp', verifyOTP);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:resettoken', resetPassword);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

module.exports = router;

