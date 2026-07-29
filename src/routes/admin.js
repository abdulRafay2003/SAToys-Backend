const express = require('express');
const validate = require('../middleware/validate');
const { protect, requireStaff, requirePermission } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { listQuery, idParam } = require('../validators/common');

const product = require('../controllers/productController');
const taxonomy = require('../controllers/taxonomyController');
const review = require('../controllers/reviewController');
const content = require('../controllers/contentController');
const storefront = require('../controllers/storefrontController');
const order = require('../controllers/orderController');
const user = require('../controllers/userController');
const uploads = require('../controllers/uploadController');
const analytics = require('../controllers/analyticsController');

const catalogueV = require('../validators/catalogue');
const contentV = require('../validators/content');
const commerceV = require('../validators/commerce');
const reviewV = require('../validators/review');
const authV = require('../validators/auth');

const router = express.Router();

// Every admin route needs a session with at least some admin access; individual
// routes then narrow to a specific permission.
router.use(protect, requireStaff);

/**
 * Mount a crudFactory's handlers under one path with one permission family.
 * Keeps thirteen resources from becoming seventy near-identical route lines.
 */
function mountCrud(path, resource, crud, { create, update } = {}) {
  const can = (action) => requirePermission(`${resource}:${action}`);

  router.get(path, can('read'), validate({ query: listQuery }), crud.list);
  router.post(`${path}/reorder`, can('update'), validate({ body: catalogueV.reorder }), crud.reorder);
  router.get(`${path}/:id`, can('read'), validate({ params: idParam }), crud.getOne);
  router.post(path, can('create'), create ? validate({ body: create }) : (req, res, next) => next(), crud.create);
  router.patch(
    `${path}/:id`,
    can('update'),
    validate({ params: idParam, ...(update ? { body: update } : {}) }),
    crud.update,
  );
  router.delete(`${path}/:id`, can('delete'), validate({ params: idParam }), crud.remove);
}

// --- Analytics ---------------------------------------------------------------
router.get('/analytics/overview', requirePermission('analytics:read'), analytics.overview);
router.get('/analytics/sales', requirePermission('analytics:read'), analytics.sales);
router.get('/analytics/products', requirePermission('analytics:read'), analytics.products);
router.get('/analytics/customers', requirePermission('analytics:read'), analytics.customers);
router.get('/analytics/orders', requirePermission('analytics:read'), analytics.orders);

// --- Products (bespoke: stock, bulk, publish-state filtering) ----------------
router.get('/products', requirePermission('product:read'), product.listAdmin);
router.get('/products/:id', requirePermission('product:read'), validate({ params: idParam }), product.getAdmin);
router.post('/products', requirePermission('product:create'), validate({ body: catalogueV.createProduct }), product.createProduct);
router.patch('/products/:id', requirePermission('product:update'), validate({ params: idParam, body: catalogueV.updateProduct }), product.updateProduct);
router.delete('/products/:id', requirePermission('product:delete'), validate({ params: idParam }), product.deleteProduct);
router.patch('/products/:id/stock', requirePermission('inventory:update'), validate({ params: idParam, body: catalogueV.adjustStock }), product.adjustStock);
router.post('/products/bulk', requirePermission('product:update'), product.bulkUpdate);

router.get('/inventory', requirePermission('inventory:read'), product.inventory);

// --- Taxonomy ----------------------------------------------------------------
mountCrud('/categories', 'category', taxonomy.categoryCrud, {
  create: catalogueV.createCategory,
  update: catalogueV.updateCategory,
});
mountCrud('/brands', 'brand', taxonomy.brandCrud, {
  create: catalogueV.createBrand,
  update: catalogueV.updateBrand,
});
mountCrud('/collections', 'collection', taxonomy.collectionCrud, {
  create: catalogueV.createCollection,
  update: catalogueV.updateCollection,
});

// --- Reviews (moderation, not plain CRUD) ------------------------------------
router.get('/reviews', requirePermission('review:read'), review.listAdmin);
router.get('/reviews/stats', requirePermission('review:read'), review.stats);
router.patch('/reviews/:id', requirePermission('review:update'), validate({ params: idParam, body: reviewV.moderateReview }), review.moderate);
router.post('/reviews/bulk', requirePermission('review:update'), review.moderateMany);
router.delete('/reviews/:id', requirePermission('review:delete'), validate({ params: idParam }), review.remove);

// --- Content & merchandising -------------------------------------------------
mountCrud('/posts', 'post', content.postCrud, { create: contentV.createPost, update: contentV.updatePost });
mountCrud('/faqs', 'faq', content.faqCrud, { create: contentV.createFaq, update: contentV.updateFaq });
mountCrud('/testimonials', 'testimonial', content.testimonialCrud, {
  create: contentV.createTestimonial,
  update: contentV.updateTestimonial,
});
mountCrud('/banners', 'banner', content.bannerCrud, {
  create: contentV.createBanner,
  update: contentV.updateBanner,
});
mountCrud('/home-sections', 'home', content.homeSectionCrud, {
  create: contentV.createHomeSection,
  update: contentV.updateHomeSection,
});
mountCrud('/coupons', 'coupon', content.couponCrud, {
  create: commerceV.createCoupon,
  update: commerceV.updateCoupon,
});
mountCrud('/shipping-options', 'shipping', content.shippingCrud, {
  create: commerceV.createShipping,
  update: commerceV.updateShipping,
});

// --- Navigation & settings (singletons, so no factory) -----------------------
router.get('/nav/:location', requirePermission('nav:read'), storefront.getNavAdmin);
router.put('/nav/:location', requirePermission('nav:update'), validate({ body: contentV.updateNav }), storefront.updateNav);

router.get('/settings', requirePermission('settings:read'), storefront.getSettingsAdmin);
router.patch('/settings', requirePermission('settings:update'), validate({ body: contentV.updateSettings }), storefront.updateSettings);

// --- Orders ------------------------------------------------------------------
router.get('/orders', requirePermission('order:read'), order.listAdmin);
router.get('/orders/:id', requirePermission('order:read'), validate({ params: idParam }), order.getAdmin);
router.get('/orders/:id/invoice', requirePermission('order:read'), validate({ params: idParam }), order.invoice);
router.patch('/orders/:id/status', requirePermission('order:update'), validate({ params: idParam, body: commerceV.updateOrderStatus }), order.updateStatus);
router.patch('/orders/:id/shipping', requirePermission('order:update'), validate({ params: idParam, body: commerceV.updateOrderShipping }), order.updateShipping);

// --- Customers & staff -------------------------------------------------------
router.get('/customers', requirePermission('customer:read'), user.listCustomers);
router.get('/customers/:id', requirePermission('customer:read'), validate({ params: idParam }), user.getCustomer);
router.post('/customers', requirePermission('customer:create'), validate({ body: authV.createStaff }), user.createStaff);
router.patch('/customers/:id', requirePermission('customer:update'), validate({ params: idParam, body: authV.updateUser }), user.updateUser);
router.delete('/customers/:id', requirePermission('customer:delete'), validate({ params: idParam }), user.deleteUser);

// --- Roles & permissions -----------------------------------------------------
router.get('/permissions', requirePermission('role:read'), user.listPermissions);
router.get('/roles', requirePermission('role:read'), user.listRoles);
router.post('/roles', requirePermission('role:create'), validate({ body: authV.createRole }), user.createRole);
router.patch('/roles/:id', requirePermission('role:update'), validate({ params: idParam, body: authV.updateRole }), user.updateRole);
router.delete('/roles/:id', requirePermission('role:delete'), validate({ params: idParam }), user.deleteRole);

// --- Uploads -----------------------------------------------------------------
router.get('/uploads/:folder', requirePermission('upload:read'), uploads.list);
router.post('/uploads/:folder', requirePermission('upload:create'), upload.single, uploads.uploadOne);
router.post('/uploads/:folder/batch', requirePermission('upload:create'), upload.many, uploads.uploadMany);
router.delete('/uploads/:folder/:filename', requirePermission('upload:delete'), uploads.remove);

module.exports = router;
