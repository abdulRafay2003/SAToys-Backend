const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const auth = require('../controllers/authController');
const V = require('../validators/auth');

const router = express.Router();

/**
 * Credential endpoints are rate limited per IP. Without this, a 6-digit OTP and
 * an 8-character password are both brute-forceable in minutes.
 */
const strict = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many attempts. Try again shortly.', code: 'RATE_LIMITED' } },
});

router.post('/register', strict, validate({ body: V.register }), auth.register);
router.post('/login', strict, validate({ body: V.login }), auth.login);
router.post('/admin/login', strict, validate({ body: V.login }), auth.adminLogin);

router.post('/forgot-password', strict, validate({ body: V.forgotPassword }), auth.forgotPassword);
router.post('/reset-password', strict, validate({ body: V.resetPassword }), auth.resetPassword);
router.post('/send-otp', strict, validate({ body: V.forgotPassword }), auth.sendOtp);
router.post('/verify-otp', strict, validate({ body: V.verifyOtp }), auth.verifyOtp);

router.get('/me', protect, auth.me);
router.post('/change-password', protect, validate({ body: V.changePassword }), auth.changePassword);

module.exports = router;
