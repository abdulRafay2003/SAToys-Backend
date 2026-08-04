const { BlogPost, Faq, Testimonial, Banner, HomeSection, Coupon, ShippingOption, ContactMessage } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated } = require('../utils/respond');
const { parsePagination, paginate } = require('../utils/query');
const crudFactory = require('./crudFactory');
const S = require('../services/serialisers');

/**
 * Editorial content and merchandising. All of it was previously hardcoded in
 * `Toys-Website/src/data/seed/content.ts` and `data/config/nav.ts`.
 */

// --- Admin CRUD --------------------------------------------------------------

const postCrud = crudFactory({
  Model: BlogPost,
  tags: ['content'],
  name: 'Post',
  searchFields: ['title', 'slug', 'author', 'topic'],
  slugFrom: 'title',
  sort: { publishedAt: -1, createdAt: -1 },
  serialise: (d) => ({ ...S.post(d), isPublished: d.isPublished, seo: d.seo }),
});

const faqCrud = crudFactory({
  Model: Faq,
  tags: ['content'],
  name: 'FAQ',
  searchFields: ['question', 'answer'],
  serialise: (d) => ({ ...S.faq(d), sortOrder: d.sortOrder, isPublished: d.isPublished }),
});

const testimonialCrud = crudFactory({
  Model: Testimonial,
  tags: ['content'],
  name: 'Testimonial',
  searchFields: ['quote', 'author'],
  serialise: (d) => ({ ...S.testimonial(d), sortOrder: d.sortOrder, isPublished: d.isPublished }),
});

/**
 * Contact form submissions. Admin-only inbox — no storefront cache tag, and
 * only list/getOne/update(status)/remove are mounted (see routes/admin.js);
 * there is nothing to author here, messages only arrive via the public POST.
 */
const contactMessageCrud = crudFactory({
  Model: ContactMessage,
  name: 'Message',
  searchFields: ['name', 'email', 'subject', 'message'],
  sort: { createdAt: -1 },
  serialise: S.contactMessage,
});

const bannerCrud = crudFactory({
  Model: Banner,
  tags: ['banners'],
  name: 'Banner',
  searchFields: ['title', 'subtitle'],
  serialise: (d) => ({
    ...S.banner(d),
    isActive: d.isActive,
    sortOrder: d.sortOrder,
    startsAt: S.iso(d.startsAt),
    endsAt: S.iso(d.endsAt),
    category: d.category ? String(d.category) : null,
  }),
});

const homeSectionCrud = crudFactory({
  Model: HomeSection,
  tags: ['home'],
  name: 'Section',
  searchFields: ['name', 'heading'],
  populate: [
    { path: 'config.products', select: 'name slug' },
    { path: 'config.collections', select: 'name slug' },
  ],
  serialise: (d) => d.toJSON?.() ?? d,
});

const couponCrud = crudFactory({
  Model: Coupon,
  tags: ['settings'],
  name: 'Coupon',
  searchFields: ['code', 'description'],
  sort: { createdAt: -1 },
  serialise: (d) => ({
    ...S.coupon(d),
    id: String(d._id || d.id),
    isActive: d.isActive,
    validFrom: S.iso(d.validFrom),
    validUntil: S.iso(d.validUntil),
    usageLimit: d.usageLimit,
    usageCount: d.usageCount,
    perUserLimit: d.perUserLimit,
  }),
});

const shippingCrud = crudFactory({
  Model: ShippingOption,
  tags: ['settings'],
  name: 'Delivery option',
  searchFields: ['label', 'key'],
  serialise: (d) => ({ ...S.shippingOption(d), isActive: d.isActive, sortOrder: d.sortOrder }),
});

// --- Public reads ------------------------------------------------------------

const listPosts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.validatedQuery || req.query, 12);
  const q = req.validatedQuery || req.query;

  const filter = { isPublished: true };
  if (q.topic) filter.topic = q.topic;

  const result = await paginate(
    BlogPost,
    filter,
    { page, limit, skip },
    { sort: { publishedAt: -1 } },
  );
  return paginated(res, { ...result, items: result.items.map(S.post) });
});

const getPost = asyncHandler(async (req, res) => {
  const doc = await BlogPost.findOne({ slug: req.params.slug, isPublished: true });
  if (!doc) throw ApiError.notFound('Post');
  return ok(res, S.post(doc));
});

const listFaqs = asyncHandler(async (req, res) => {
  const docs = await Faq.find({ isPublished: true }).sort({ group: 1, sortOrder: 1 }).lean();
  return ok(res, docs.map(S.faq));
});

const listTestimonials = asyncHandler(async (req, res) => {
  const docs = await Testimonial.find({ isPublished: true }).sort({ sortOrder: 1 }).lean();
  return ok(res, docs.map(S.testimonial));
});

/** GET /banners?placement=announcement — only banners live right now. */
const listBanners = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const filter = Banner.liveFilter();
  if (q.placement) filter.placement = q.placement;

  const docs = await Banner.find(filter).sort({ sortOrder: 1 }).lean();
  return ok(res, docs.map(S.banner));
});

const listShippingOptions = asyncHandler(async (req, res) => {
  const docs = await ShippingOption.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }).lean();
  return ok(res, docs.map(S.shippingOption));
});

/** POST /contact — the storefront's contact form. */
const submitContactMessage = asyncHandler(async (req, res) => {
  const doc = await ContactMessage.create(req.body);
  return created(res, S.contactMessage(doc));
});

module.exports = {
  postCrud,
  faqCrud,
  testimonialCrud,
  bannerCrud,
  homeSectionCrud,
  couponCrud,
  shippingCrud,
  contactMessageCrud,
  listPosts,
  getPost,
  listFaqs,
  listTestimonials,
  listBanners,
  listShippingOptions,
  submitContactMessage,
};
