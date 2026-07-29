const express = require('express');
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrder,
  getOrders,
  updateOrderStatus,
  cancelOrder,
  getOrderTracking,
} = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/auth');

router.post('/', protect, createOrder);
router.get('/myorders', protect, getMyOrders);
router.get('/admin', protect, authorize('admin'), getOrders);
router.get('/:id/tracking', protect, getOrderTracking);
router.put('/:id/cancel', protect, cancelOrder);
router.put('/:id/status', protect, authorize('admin'), updateOrderStatus);
router.get('/:id', protect, getOrder);

module.exports = router;

