const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const { optionalAuth } = require('../middleware/auth');
const { productQuery, slugParam, listQuery } = require('../validators/common');
const { reviewQuery, createReview } = require('../validators/review');
const { validateCoupon, estimateShipping, createOrder, quoteOrder } = require('../validators/commerce');
const { createContactMessage } = require('../validators/content');

const product = require('../controllers/productController');
const taxonomy = require('../controllers/taxonomyController');
const review = require('../controllers/reviewController');
const content = require('../controllers/contentController');
const storefront = require('../controllers/storefrontController');
const order = require('../controllers/orderController');

/**
 * Everything the storefront reads without a session.
 *
 * All of it is publish-state filtered at the controller: drafts, unapproved
 * reviews and inactive taxonomy never appear here regardless of query.
 */
const router = express.Router();

// --- Composite ---------------------------------------------------------------
router.get('/bootstrap', storefront.bootstrap);
router.get('/home', storefront.home);
router.get('/nav', storefront.nav);
router.get('/settings', storefront.settings);

// --- Catalogue ---------------------------------------------------------------
router.get('/products', validate({ query: productQuery }), product.listPublic);
// Must precede /products/:slug, or "slugs" is swallowed as a slug.
router.get('/products/slugs', product.listSlugs);
router.get('/products/:slug', validate({ params: slugParam }), product.getPublic);
router.get('/products/:slug/recommendations', validate({ params: slugParam }), product.getRecommendations);
router.get(
  '/products/:slug/reviews',
  validate({ params: slugParam, query: reviewQuery }),
  review.listForProduct,
);

router.get('/categories', taxonomy.listCategories);
router.get('/categories/:slug', validate({ params: slugParam }), taxonomy.getCategory);

router.get('/brands', taxonomy.listBrands);
router.get('/brands/:slug', validate({ params: slugParam }), taxonomy.getBrand);

router.get('/collections', taxonomy.listCollections);
router.get('/collections/:slug', validate({ params: slugParam }), taxonomy.getCollection);

// --- Search ------------------------------------------------------------------
router.get('/search/suggestions', validate({ query: productQuery }), product.suggestions);

// --- Reviews -----------------------------------------------------------------
router.get('/reviews', validate({ query: reviewQuery }), review.listPublic);
router.post('/reviews', optionalAuth, validate({ body: createReview }), review.submit);
router.post('/reviews/:id/helpful', review.markHelpful);

// --- Content -----------------------------------------------------------------
router.get('/posts', validate({ query: listQuery }), content.listPosts);
router.get('/posts/:slug', validate({ params: slugParam }), content.getPost);
router.get('/faqs', content.listFaqs);
router.get('/testimonials', content.listTestimonials);
router.get('/banners', content.listBanners);
router.get('/shipping-options', content.listShippingOptions);

/** Rate-limited: an unauthenticated write endpoint is an open spam invitation otherwise. */
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many messages. Try again in a few minutes.', code: 'RATE_LIMITED' },
  },
});
router.post('/contact', contactLimiter, validate({ body: createContactMessage }), content.submitContactMessage);

// --- Commerce ----------------------------------------------------------------
router.post('/coupons/validate', optionalAuth, validate({ body: validateCoupon }), storefront.validateCoupon);
router.post('/shipping/estimate', validate({ body: estimateShipping }), storefront.estimateShipping);

router.post('/orders/quote', optionalAuth, validate({ body: quoteOrder }), order.quote);
router.post('/orders', optionalAuth, validate({ body: createOrder }), order.create);
/**
 * Order lookup is a guessing surface: the order number and email together are
 * the only credential. The blanket limiter allows 300/min, which is plenty of
 * room to grind; this caps it at 10 attempts per IP per 15 minutes.
 */
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many lookups. Try again in a few minutes.', code: 'RATE_LIMITED' },
  },
});

router.get('/orders/track/:orderNumber', trackLimiter, order.track);

module.exports = router;
