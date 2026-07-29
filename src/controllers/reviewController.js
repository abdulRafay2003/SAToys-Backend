const { Review, Product, Order } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, noContent, paginated } = require('../utils/respond');
const { parsePagination, paginate } = require('../utils/query');
const { recomputeProductRating } = require('../services/rating');
const S = require('../services/serialisers');
const { revalidateTags } = require('../services/revalidate');

const SORTS = {
  recent: { createdAt: -1 },
  helpful: { helpful: -1, createdAt: -1 },
  rating: { rating: -1, createdAt: -1 },
};

// =============================================================================
// Public
// =============================================================================

/** GET /products/:slug/reviews — approved only, always. */
const listForProduct = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const product = await Product.findOne({ slug: req.params.slug }).select('_id');
  if (!product) throw ApiError.notFound('Product');

  const filter = { product: product._id, status: 'approved' };
  if (q.rating) filter.rating = q.rating;

  const { page, limit, skip } = parsePagination(q, 12);
  const result = await paginate(Review, filter, { page, limit, skip }, { sort: SORTS[q.sort] || SORTS.helpful });

  return paginated(res, { ...result, items: result.items.map(S.review) });
});

/** GET /reviews — the cross-product /reviews page. */
const listPublic = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const filter = { status: 'approved' };
  if (q.rating) filter.rating = q.rating;

  const { page, limit, skip } = parsePagination(q, 24);
  const result = await paginate(
    Review,
    filter,
    { page, limit, skip },
    { sort: SORTS[q.sort] || SORTS.recent, populate: { path: 'product', select: 'slug name' } },
  );

  const body = { ...result, items: result.items.map(S.review) };
  let summary;

  /**
   * `?summary=true` adds the site-wide aggregate the reviews page leads with.
   *
   * Computed over every approved review, not over the page being returned —
   * the average of the 12 most helpful reviews is not the shop's average
   * rating, and presenting it as one would be a lie.
   */
  if (q.summary) {
    const rows = await Review.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]);

    const distribution = [0, 0, 0, 0, 0];
    let total = 0;
    let weighted = 0;
    for (const row of rows) {
      const stars = Number(row._id);
      if (stars >= 1 && stars <= 5) {
        distribution[stars - 1] = row.count;
        total += row.count;
        weighted += stars * row.count;
      }
    }

    summary = {
      total,
      average: total ? Number((weighted / total).toFixed(2)) : 0,
      distribution,
    };
  }

  // `summary` rides alongside the page rather than inside `data`, which stays
  // the array of reviews — same envelope shape as every other list endpoint.
  return paginated(res, body, summary ? { summary } : {});
});

/**
 * POST /reviews — customer submission.
 *
 * Always lands as `pending`; the storefront never shows it until an admin
 * approves. `verified` is decided here from order history, not accepted from
 * the client, because it is a trust signal.
 */
const submit = asyncHandler(async (req, res) => {
  const { productId, ...body } = req.body;

  const product = await Product.findById(productId).select('_id');
  if (!product) throw ApiError.notFound('Product');

  const email = body.email || req.user?.email;
  let verified = false;

  if (email) {
    verified = Boolean(
      await Order.exists({
        email: email.toLowerCase(),
        'items.product': product._id,
        status: { $in: ['delivered', 'shipped'] },
      }),
    );
  }

  const doc = await Review.create({
    ...body,
    email,
    product: product._id,
    user: req.user?._id || null,
    verified,
    status: 'pending',
  });

  return created(res, {
    ...S.review(doc),
    message: 'Thanks — your review will appear once it has been checked.',
  });
});

/** POST /reviews/:id/helpful */
const markHelpful = asyncHandler(async (req, res) => {
  const doc = await Review.findOneAndUpdate(
    { _id: req.params.id, status: 'approved' },
    { $inc: { helpful: 1 } },
    { new: true },
  );
  if (!doc) throw ApiError.notFound('Review');
  return ok(res, { id: String(doc._id), helpful: doc.helpful });
});

// =============================================================================
// Admin
// =============================================================================

const listAdmin = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.rating) filter.rating = q.rating;
  if (q.productId) filter.product = q.productId;

  const { page, limit, skip } = parsePagination(q, 25);
  const result = await paginate(
    Review,
    filter,
    { page, limit, skip },
    { sort: { createdAt: -1 }, populate: { path: 'product', select: 'slug name images' } },
  );

  return paginated(res, {
    ...result,
    items: result.items.map((r) => ({
      ...S.review(r),
      status: r.status,
      email: r.email || null,
      productName: r.product?.name || null,
      moderatedAt: S.iso(r.moderatedAt),
      moderationNote: r.moderationNote || null,
    })),
  });
});

/**
 * PATCH /admin/reviews/:id — approve or reject.
 *
 * Recomputing the product's rating here is what makes moderation take effect
 * immediately rather than on the next nightly job.
 */
const moderate = asyncHandler(async (req, res) => {
  const doc = await Review.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Review');

  doc.status = req.body.status;
  doc.moderationNote = req.body.moderationNote ?? doc.moderationNote;
  doc.moderatedBy = req.user._id;
  doc.moderatedAt = new Date();
  await doc.save();

  const rating = await recomputeProductRating(doc.product);

  revalidateTags(['reviews', 'products']);
  return ok(res, { ...S.review(doc), status: doc.status, productRating: rating });
});

/** Bulk approve/reject from the moderation queue. */
const moderateMany = asyncHandler(async (req, res) => {
  const { ids, status } = req.body;

  const reviews = await Review.find({ _id: { $in: ids } }).select('product');
  await Review.updateMany(
    { _id: { $in: ids } },
    { $set: { status, moderatedBy: req.user._id, moderatedAt: new Date() } },
  );

  // One recompute per affected product, not per review. Deduplicated by string
  // key but recomputed with the ObjectId, which is what the $match needs.
  const byProduct = new Map(reviews.map((r) => [String(r.product), r.product]));
  await Promise.all([...byProduct.values()].map(recomputeProductRating));

  revalidateTags(['reviews', 'products']);
  return ok(res, { updated: ids.length, productsRecomputed: byProduct.size });
});

const remove = asyncHandler(async (req, res) => {
  const doc = await Review.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Review');

  const productId = doc.product;
  await doc.deleteOne();
  await recomputeProductRating(productId);

  revalidateTags(['reviews', 'products']);
  return noContent(res);
});

/** Counts for the moderation queue's tab badges. */
const stats = asyncHandler(async (req, res) => {
  const rows = await Review.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  const out = { pending: 0, approved: 0, rejected: 0 };
  for (const r of rows) out[r._id] = r.n;
  return ok(res, out);
});

module.exports = {
  listForProduct,
  listPublic,
  submit,
  markHelpful,
  listAdmin,
  moderate,
  moderateMany,
  remove,
  stats,
};
