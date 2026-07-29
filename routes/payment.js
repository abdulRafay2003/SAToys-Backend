const express = require('express');
const router = express.Router();
const {
  createPaymentIntent,
  confirmPayment,
  getPaymentStatus,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.post('/create-payment-intent', createPaymentIntent);
router.post('/confirm', confirmPayment);
router.get('/status/:paymentIntentId', getPaymentStatus);

module.exports = router;

