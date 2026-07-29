const { Product, Category, Brand, Collection } = require('../models');
const { PRODUCT_SORTS } = require('../config/constants');
const { escapeRegex } = require('../utils/query');

/**
 * Product querying, ported from `Toys-Website/src/lib/catalogue.ts`.
 *
 * The storefront's filter/sort/facet semantics are reproduced here rather than
 * reinvented, so swapping the seed array for this API changes where the data
 * comes from and nothing about how a filtered URL behaves.
 */

const POPULATE = [
  { path: 'brand', select: 'slug name tone' },
  { path: 'categories', select: 'slug name kind tone' },
  { path: 'collections', select: 'slug name tone' },
];

/** Only active products are ever visible to the storefront. */
const PUBLIC = { status: 'active' };

/**
 * Slugs in, ObjectIds out. The storefront filters by slug because that is what
 * is in the URL; the database joins by id.
 *
 * A slug that matches nothing yields an id list of `[]`, which correctly
 * produces zero results rather than being ignored.
 */
async function resolveRefs({ category, brand, collection }) {
  const [cats, brands, cols] = await Promise.all([
    category ? Category.find({ slug: { $in: category } }).select('_id').lean() : null,
    brand ? Brand.find({ slug: { $in: brand } }).select('_id').lean() : null,
    collection ? Collection.find({ slug: { $in: collection } }).select('_id').lean() : null,
  ]);

  return {
    categoryIds: cats && cats.map((c) => c._id),
    brandIds: brands && brands.map((b) => b._id),
    collectionIds: cols && cols.map((c) => c._id),
  };
}

/**
 * Build the Mongo filter for a query.
 *
 * @param {object} q      parsed query
 * @param {object} refs   resolved ObjectId lists
 * @param {string} [omit] a dimension to leave out — used for facet counting
 */
function buildFilter(q, refs, omit) {
  const filter = { ...PUBLIC };
  const and = [];

  if (omit !== 'category' && refs.categoryIds) filter.categories = { $in: refs.categoryIds };
  if (omit !== 'brand' && refs.brandIds) filter.brand = { $in: refs.brandIds };
  if (omit !== 'collection' && refs.collectionIds) filter.collections = { $in: refs.collectionIds };

  if (q.min !== undefined || q.max !== undefined) {
    filter.price = {};
    if (q.min !== undefined) filter.price.$gte = q.min;
    if (q.max !== undefined) filter.price.$lte = q.max;
  }

  if (q.rating !== undefined) filter['rating.average'] = { $gte: q.rating };

  // Age filtering is an overlap test, matching the storefront: a product shows
  // if its band intersects the requested band at all, not if it sits inside it.
  if (q.ageMin !== undefined) and.push({ 'ageRange.max': { $gte: q.ageMin } });
  if (q.ageMax !== undefined) and.push({ 'ageRange.min': { $lte: q.ageMax } });

  if (omit !== 'badge' && q.badge?.length) {
    // `new`, `bestseller` and `sale` are derived, so they cannot be matched
    // against the stored array — each maps onto the condition it is derived from.
    const stored = [];
    for (const b of q.badge) {
      if (b === 'sale') and.push({ $expr: { $gt: ['$compareAtPrice', '$price'] } });
      else if (b === 'bestseller') and.push({ isBestSeller: true });
      else if (b === 'new') {
        and.push({
          $or: [
            { isNewArrival: true },
            { publishedAt: { $gte: new Date(Date.now() - 30 * 864e5) } },
          ],
        });
      } else stored.push(b);
    }
    if (stored.length) filter.badges = { $in: stored };
  }

  if (q.inStock) filter['stock.status'] = { $ne: 'sold-out' };

  if (q.featured !== undefined) filter.isFeatured = q.featured;
  if (q.trending !== undefined) filter.isTrending = q.trending;
  if (q.newArrival !== undefined) filter.isNewArrival = q.newArrival;
  if (q.bestSeller !== undefined) filter.isBestSeller = q.bestSeller;

  if (q.q) {
    // Regex rather than $text: the storefront does substring matching
    // ("wood" matches "Wooden"), which $text's word-stemming would miss.
    const rx = new RegExp(escapeRegex(q.q), 'i');
    and.push({ $or: [{ name: rx }, { tagline: rx }, { tags: rx }, { sku: rx }] });
  }

  if (and.length) filter.$and = and;
  return filter;
}

/**
 * Facet counts. Each dimension is counted against the *other* active filters
 * but not its own — so ticking one category still shows what ticking a second
 * would add, instead of zeroing every other count.
 */
async function computeFacets(q, refs) {
  const [categories, brands, badges, priceRange] = await Promise.all([
    Product.aggregate([
      { $match: buildFilter(q, refs, 'category') },
      { $unwind: '$categories' },
      { $group: { _id: '$categories', n: { $sum: 1 } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'c' } },
      { $unwind: '$c' },
      { $project: { _id: 0, slug: '$c.slug', n: 1 } },
    ]),
    Product.aggregate([
      { $match: buildFilter(q, refs, 'brand') },
      { $group: { _id: '$brand', n: { $sum: 1 } } },
      { $lookup: { from: 'brands', localField: '_id', foreignField: '_id', as: 'b' } },
      { $unwind: '$b' },
      { $project: { _id: 0, slug: '$b.slug', n: 1 } },
    ]),
    Product.aggregate([
      { $match: buildFilter(q, refs, 'badge') },
      {
        $project: {
          all: {
            $setUnion: [
              { $ifNull: ['$badges', []] },
              { $cond: [{ $gt: ['$compareAtPrice', '$price'] }, ['sale'], []] },
              { $cond: ['$isBestSeller', ['bestseller'], []] },
              { $cond: ['$isNewArrival', ['new'], []] },
            ],
          },
        },
      },
      { $unwind: '$all' },
      { $group: { _id: '$all', n: { $sum: 1 } } },
      { $project: { _id: 0, slug: '$_id', n: 1 } },
    ]),
    Product.aggregate([
      { $match: buildFilter(q, refs) },
      { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
    ]),
  ]);

  const toMap = (rows) => Object.fromEntries(rows.map((r) => [r.slug, r.n]));

  return {
    categories: toMap(categories),
    brands: toMap(brands),
    badges: toMap(badges),
    priceMin: priceRange[0]?.min ?? 0,
    priceMax: priceRange[0]?.max ?? 0,
  };
}

/**
 * @returns {{items, total, page, pages, limit, facets}}
 */
async function queryProducts(q = {}, { withFacets = true } = {}) {
  const refs = await resolveRefs(q);
  const filter = buildFilter(q, refs);

  const page = Math.max(1, q.page || 1);
  const limit = Math.min(100, Math.max(1, q.limit || 24));
  const skip = (page - 1) * limit;
  const sortKey = q.sort || 'popular';

  let items;
  let total;

  if (sortKey === 'discount') {
    // Not expressible as a plain sort — the saving is a ratio of two fields.
    const rows = await Product.aggregate([
      { $match: filter },
      {
        $addFields: {
          _saving: {
            $cond: [
              { $gt: ['$compareAtPrice', '$price'] },
              { $divide: [{ $subtract: ['$compareAtPrice', '$price'] }, '$compareAtPrice'] },
              0,
            ],
          },
        },
      },
      { $sort: { _saving: -1, popularity: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);
    items = await Product.populate(rows, POPULATE);
    total = await Product.countDocuments(filter);
  } else {
    const sort = PRODUCT_SORTS[sortKey] || PRODUCT_SORTS.popular;
    [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limit).populate(POPULATE).lean({ virtuals: true }),
      Product.countDocuments(filter),
    ]);
  }

  const facets = withFacets ? await computeFacets(q, refs) : undefined;

  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), facets };
}

const findBySlug = (slug, { publicOnly = true } = {}) =>
  Product.findOne({ slug, ...(publicOnly ? PUBLIC : {}) }).populate(POPULATE);

/**
 * Four deterministic recommendation strategies, mirroring getRecommendations()
 * in the storefront's catalogue.ts.
 */
async function recommendationsFor(doc) {
  const exclude = { _id: { $ne: doc._id }, ...PUBLIC };

  const [completesTheSet, othersAlsoLoved, moreFromBrand, youMightAlsoLike] = await Promise.all([
    doc.bundle?.length
      ? Product.find({ _id: { $in: doc.bundle }, ...PUBLIC }).populate(POPULATE).lean({ virtuals: true })
      : [],
    doc.related?.length
      ? Product.find({ _id: { $in: doc.related }, ...PUBLIC }).populate(POPULATE).lean({ virtuals: true })
      : [],
    doc.brand
      ? Product.find({ ...exclude, brand: doc.brand })
          .sort({ popularity: -1 })
          .limit(8)
          .populate(POPULATE)
          .lean({ virtuals: true })
      : [],
    Product.find({
      ...exclude,
      price: { $gte: doc.price - 2500, $lte: doc.price + 2500 },
      'ageRange.min': { $lte: doc.ageRange?.max ?? 99 },
      'ageRange.max': { $gte: doc.ageRange?.min ?? 0 },
    })
      .sort({ 'rating.average': -1, 'rating.count': -1 })
      .limit(8)
      .populate(POPULATE)
      .lean({ virtuals: true }),
  ]);

  return { completesTheSet, othersAlsoLoved, moreFromBrand, youMightAlsoLike };
}

module.exports = {
  queryProducts,
  findBySlug,
  recommendationsFor,
  computeFacets,
  buildFilter,
  resolveRefs,
  POPULATE,
  PUBLIC,
};
