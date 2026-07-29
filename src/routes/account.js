const express = require('express');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const user = require('../controllers/userController');
const order = require('../controllers/orderController');
const V = require('../validators/auth');

/** The signed-in customer's own data. Every route is scoped to req.user. */
const router = express.Router();

router.use(protect);

router.patch('/profile', validate({ body: V.updateProfile }), user.updateProfile);

router.get('/addresses', user.listAddresses);
router.post('/addresses', validate({ body: V.upsertAddress }), user.addAddress);
router.patch('/addresses/:addressId', validate({ body: V.upsertAddress.partial() }), user.updateAddress);
router.delete('/addresses/:addressId', user.removeAddress);

router.get('/wishlist', user.getWishlist);
router.post('/wishlist/:productId', user.addToWishlist);
router.delete('/wishlist/:productId', user.removeFromWishlist);

router.get('/orders', order.listMine);
router.get('/orders/:id', order.getMine);

module.exports = router;
