const { Product, Review, Order } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, noContent, paginated } = require('../utils/respond');
const { parsePagination, paginate, escapeRegex } = require('../utils/query');
const { toSlug, uniqueSlug } = require('../utils/slug');
const S = require('../services/serialisers');
const catalogue = require('../services/catalogue');

/** Every image needs a gradient seed, even when a real photo is attached. */
const withSeeds = (images, slug) =>
  (images || []).map((img, i) => ({
    ...img,
    seed: img.seed || `${slug}-${i}`,
  }));

// =============================================================================
// Public
// =============================================================================

/** GET /products — the storefront's main listing. Filters, sorts, facets, pages. */
const listPublic = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const result = await catalogue.queryProducts(q, { withFacets: q.facets !== false });

  return paginated(
    res,
    { ...result, items: result.items.map(S.productCard) },
    result.facets ? { facets: result.facets } : {},
  );
});

/**
 * GET /products/slugs — every live product slug and its last-modified date.
 *
 * For the storefront's sitemap. Kept separate from the listing so a sitemap
 * build does not pull whole product documents it will never render; this is a
 * lean projection over an index.
 *
 * Declared before `/products/:slug` in the router, otherwise "slugs" would be
 * captured as a slug.
 */
const listSlugs = asyncHandler(async (req, res) => {
  const docs = await Product.find({ status: 'active' })
    .select('slug updatedAt')
    .sort({ updatedAt: -1 })
    .lean();

  return ok(
    res,
    docs.map((d) => ({ slug: d.slug, updatedAt: d.updatedAt })),
  );
});

/** GET /products/:slug */
const getPublic = asyncHandler(async (req, res) => {
  const doc = await catalogue.findBySlug(req.params.slug);
  if (!doc) throw ApiError.notFound('Product');

  // Fire-and-forget: a view counter must never delay or fail the response.
  Product.updateOne({ _id: doc._id }, { $inc: { viewCount: 1 } }).catch(() => {});

  return ok(res, S.product(doc));
});

/** GET /products/:slug/recommendations — the four rails on a product page. */
const getRecommendations = asyncHandler(async (req, res) => {
  const doc = await catalogue.findBySlug(req.params.slug);
  if (!doc) throw ApiError.notFound('Product');

  const groups = await catalogue.recommendationsFor(doc);
  return ok(
    res,
    Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map(S.productCard)])),
  );
});

/**
 * GET /search/suggestions — typeahead. Deliberately thin: name, slug and a seed
 * for the thumbnail, nothing else.
 */
const suggestions = asyncHandler(async (req, res) => {
  const q = (req.validatedQuery || req.query).q;
  if (!q) return ok(res, []);

  const rx = new RegExp(escapeRegex(q), 'i');
  const docs = await Product.find({ status: 'active', $or: [{ name: rx }, { tags: rx }] })
    .sort({ popularity: -1 })
    .limit(8)
    .select('name slug price images')
    .lean();

  return ok(
    res,
    docs.map((p) => ({
      id: String(p._id),
      name: p.name,
      slug: p.slug,
      price: p.price,
      image: p.images?.[0]?.url || null,
      seed: p.images?.[0]?.seed || p.slug,
    })),
  );
});

// =============================================================================
// Admin
// =============================================================================

const ADMIN_POPULATE = [
  { path: 'brand', select: 'slug name' },
  { path: 'categories', select: 'slug name kind' },
  { path: 'collections', select: 'slug name' },
];

/** Admin list — sees drafts and archived rows, which the public list never does. */
const listAdmin = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const { page, limit, skip } = parsePagination(q, 25);

  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { slug: rx }, { tags: rx }];
  }
  if (q.lowStock) {
    filter.$expr = { $lte: ['$stock.quantity', '$stock.lowStockThreshold'] };
    filter['stock.trackInventory'] = true;
  }

  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    'name-asc': { name: 1 },
    'price-asc': { price: 1 },
    'price-desc': { price: -1 },
    stock: { 'stock.quantity': 1 },
  };

  const result = await paginate(
    Product,
    filter,
    { page, limit, skip },
    { sort: sortMap[q.sort] || { createdAt: -1 }, populate: ADMIN_POPULATE },
  );

  return paginated(res, {
    ...result,
    // The admin table needs the internal fields the storefront serialiser drops.
    items: result.items.map((p) => ({
      ...S.productCard(p),
      status: p.status,
      stockQuantity: p.stock?.quantity ?? 0,
      stockStatus: p.stock?.status,
      isNewArrival: p.isNewArrival,
      isBestSeller: p.isBestSeller,
      updatedAt: S.iso(p.updatedAt),
    })),
  });
});

/** GET /admin/products/:id — the edit form's payload. Raw-ish, not storefront-shaped. */
const getAdmin = asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id).populate(ADMIN_POPULATE);
  if (!doc) throw ApiError.notFound('Product');

  return ok(res, {
    ...doc.toJSON(),
    brand: doc.brand ? String(doc.brand._id) : null,
    categories: (doc.categories || []).map((c) => String(c._id)),
    collections: (doc.collections || []).map((c) => String(c._id)),
    related: (doc.related || []).map(String),
    bundle: (doc.bundle || []).map(String),
  });
});

const createProduct = asyncHandler(async (req, res) => {
  const body = req.body;
  body.slug = await uniqueSlug(Product, toSlug(body.slug || body.name));
  body.images = withSeeds(body.images, body.slug);
  if (body.sku) body.sku = body.sku.toUpperCase();

  const doc = await Product.create(body);
  await doc.populate(ADMIN_POPULATE);
  return created(res, S.product(doc));
});

const updateProduct = asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Product');

  const body = req.body;
  if (body.slug) body.slug = await uniqueSlug(Product, toSlug(body.slug), doc._id);
  if (body.images) body.images = withSeeds(body.images, body.slug || doc.slug);
  if (body.sku) body.sku = body.sku.toUpperCase();

  Object.assign(doc, body);
  await doc.save(); // runs refreshStockStatus and the compareAtPrice guard
  await doc.populate(ADMIN_POPULATE);

  return ok(res, S.product(doc));
});

/**
 * Deleting a product would orphan its reviews and break historical orders, so
 * it is refused when the product has been ordered — archiving is the correct
 * action there, and the message says so.
 */
const deleteProduct = asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Product');

  const ordered = await Order.exists({ 'items.product': doc._id });
  if (ordered) {
    throw ApiError.conflict(
      'This product appears in past orders and cannot be deleted. Archive it instead — it will disappear from the storefront but stay on those orders.',
    );
  }

  await Review.deleteMany({ product: doc._id });
  await Product.updateMany(
    { $or: [{ related: doc._id }, { bundle: doc._id }] },
    { $pull: { related: doc._id, bundle: doc._id } },
  );
  await doc.deleteOne();

  return noContent(res);
});

/** PATCH /admin/products/:id/stock — used by the inventory screen. */
const adjustStock = asyncHandler(async (req, res) => {
  const doc = await Product.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Product');

  const { variants, ...stock } = req.body;
  Object.assign(doc.stock, stock);

  for (const v of variants || []) {
    const variant = doc.variants.id(v.id);
    if (variant) variant.stock = v.stock;
  }

  await doc.save();
  return ok(res, { id: String(doc._id), stock: doc.stock, variants: doc.variants });
});

/** Bulk flag toggles from the product table's selection toolbar. */
const bulkUpdate = asyncHandler(async (req, res) => {
  const { ids, set } = req.body;
  const allowed = ['status', 'isFeatured', 'isTrending', 'isNewArrival', 'isBestSeller'];
  const update = Object.fromEntries(Object.entries(set).filter(([k]) => allowed.includes(k)));

  if (!Object.keys(update).length) throw ApiError.badRequest('Nothing to update');

  const result = await Product.updateMany({ _id: { $in: ids } }, { $set: update });
  return ok(res, { matched: result.matchedCount, modified: result.modifiedCount });
});

/** GET /admin/inventory — low stock first, because that is the reason to open it. */
const inventory = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const { page, limit, skip } = parsePagination(q, 50);

  const filter = { 'stock.trackInventory': true };
  if (q.lowOnly) filter.$expr = { $lte: ['$stock.quantity', '$stock.lowStockThreshold'] };
  if (q.q) filter.$or = [{ name: new RegExp(escapeRegex(q.q), 'i') }, { sku: new RegExp(escapeRegex(q.q), 'i') }];

  const result = await paginate(
    Product,
    filter,
    { page, limit, skip },
    { sort: { 'stock.quantity': 1 }, select: 'name slug sku stock variants images price' },
  );

  return paginated(res, {
    ...result,
    items: result.items.map((p) => ({
      id: String(p._id),
      name: p.name,
      slug: p.slug,
      sku: p.sku || '',
      price: p.price,
      image: p.images?.[0]?.url || null,
      seed: p.images?.[0]?.seed || p.slug,
      quantity: p.stock?.quantity ?? 0,
      lowStockThreshold: p.stock?.lowStockThreshold ?? 0,
      status: p.stock?.status,
      variants: (p.variants || []).map((v) => ({ id: String(v._id), label: v.label, sku: v.sku, stock: v.stock })),
    })),
  });
});

module.exports = {
  listPublic,
  listSlugs,
  getPublic,
  getRecommendations,
  suggestions,
  listAdmin,
  getAdmin,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  bulkUpdate,
  inventory,
};
