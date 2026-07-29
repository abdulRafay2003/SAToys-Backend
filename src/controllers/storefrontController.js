const { HomeSection, NavMenu, Settings, Product, Collection, Coupon } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/respond');
const S = require('../services/serialisers');
const { applyCoupon, resolveShipping } = require('../services/pricing');

/**
 * Composite endpoints for the storefront.
 *
 * A homepage assembled from six separate requests would waterfall; these
 * resolve a whole page's content in one round trip, which matters most on the
 * routes that render above the fold.
 */

/** Resolve a product-rail section's `source` into actual products. */
async function railProducts(section) {
  const limit = section.config?.limit || 8;
  const base = { status: 'active' };

  const sorts = {
    featured: [{ ...base, isFeatured: true }, { popularity: -1 }],
    trending: [{ ...base, isTrending: true }, { popularity: -1 }],
    'new-arrivals': [{ ...base }, { publishedAt: -1, createdAt: -1 }],
    'best-sellers': [{ ...base, isBestSeller: true }, { popularity: -1 }],
  };

  if (section.config?.source === 'manual') {
    const ids = section.config.products || [];
    if (!ids.length) return [];
    const docs = await Product.find({ _id: { $in: ids }, ...base })
      .populate([{ path: 'brand', select: 'slug name' }, { path: 'categories', select: 'slug name' }])
      .lean({ virtuals: true });
    // Preserve the admin's hand-picked order, which $in does not.
    const order = new Map(ids.map((id, i) => [String(id), i]));
    return docs.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
  }

  const [filter, sort] = sorts[section.config?.source] || sorts.featured;
  return Product.find(filter)
    .sort(sort)
    .limit(limit)
    .populate([{ path: 'brand', select: 'slug name' }, { path: 'categories', select: 'slug name' }])
    .lean({ virtuals: true });
}

/**
 * GET /home — the homepage, fully resolved.
 *
 * Each section arrives with its content already attached, so the page renders
 * whatever the admin has configured without the frontend knowing which section
 * types exist.
 */
const home = asyncHandler(async (req, res) => {
  const sections = await HomeSection.find({ isActive: true })
    .sort({ sortOrder: 1 })
    .populate({ path: 'config.collections', select: 'slug name blurb tone heroImage chapters' })
    .lean({ virtuals: true });

  const resolved = await Promise.all(
    sections.map(async (section) => {
      const base = {
        id: String(section._id),
        type: section.type,
        heading: section.heading || '',
        subheading: section.subheading || '',
        body: section.body || '',
        image: section.image || null,
        tone: section.tone,
        cta: section.ctaLabel ? { label: section.ctaLabel, href: section.ctaHref } : null,
        secondaryCta: section.secondaryCtaLabel
          ? { label: section.secondaryCtaLabel, href: section.secondaryCtaHref }
          : null,
      };

      if (section.type === 'product-rail') {
        const products = await railProducts(section);
        return { ...base, source: section.config?.source, products: products.map(S.productCard) };
      }

      if (section.type === 'collection-tiles') {
        const list = section.config?.collections?.length
          ? section.config.collections
          : await Collection.find({ isActive: true }).sort({ sortOrder: 1 }).limit(6).lean();
        return { ...base, collections: list.map(S.collection) };
      }

      if (section.type === 'hero') {
        return { ...base, showCanvas: Boolean(section.config?.showCanvas) };
      }

      return base;
    }),
  );

  return ok(res, resolved);
});

/**
 * GET /nav — every menu at once.
 *
 * The header, mega menu, mobile sheet and footer all need this and all render on
 * every page; one request keyed by location beats four.
 */
const nav = asyncHandler(async (req, res) => {
  const menus = await NavMenu.find().lean();
  const byLocation = Object.fromEntries(menus.map((m) => [m.location, S.navMenu(m)]));

  return ok(res, {
    primary: byLocation.primary?.links || [],
    shopMega: byLocation['shop-mega']?.columns || [],
    collectionsPanel: byLocation['collections-panel']?.columns || [],
    footer: byLocation.footer?.columns || [],
  });
});

const settings = asyncHandler(async (req, res) => ok(res, S.settings(await Settings.load())));

/**
 * POST /coupons/validate — check a code against a subtotal.
 * Reuses the checkout's own coupon logic so the basket cannot promise a
 * discount that checkout then refuses.
 */
const validateCoupon = asyncHandler(async (req, res) => {
  const { code, subtotal } = req.body;
  const result = await applyCoupon(code, subtotal, { userId: req.user?._id });

  return ok(res, {
    valid: true,
    code: result.coupon?.code || code.toUpperCase(),
    discount: result.discount,
    freeShipping: result.freeShipping,
    description: result.doc?.description || '',
  });
});

/** POST /shipping/estimate — options with the free-shipping threshold applied. */
const estimateShipping = asyncHandler(async (req, res) => {
  const { subtotal } = req.body;
  const settingsDoc = await Settings.load();
  const { ShippingOption } = require('../models');

  const options = await ShippingOption.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }).lean();
  const threshold = settingsDoc.commerce.freeShippingThreshold;

  return ok(res, {
    options: options.map((o) => ({
      ...S.shippingOption(o),
      effectivePrice: threshold > 0 && subtotal >= threshold ? 0 : o.price,
    })),
    freeShippingThreshold: threshold,
    qualifiesForFree: threshold > 0 && subtotal >= threshold,
    remainingForFree: threshold > 0 ? Math.max(0, threshold - subtotal) : 0,
  });
});

/**
 * GET /bootstrap — nav, settings and live announcements in one call.
 * These three are needed by the root layout on literally every route.
 */
const bootstrap = asyncHandler(async (req, res) => {
  const { Banner } = require('../models');

  const [menus, settingsDoc, announcements] = await Promise.all([
    NavMenu.find().lean(),
    Settings.load(),
    Banner.find({ ...Banner.liveFilter(), placement: 'announcement' }).sort({ sortOrder: 1 }).lean(),
  ]);

  const byLocation = Object.fromEntries(menus.map((m) => [m.location, S.navMenu(m)]));

  return ok(res, {
    nav: {
      primary: byLocation.primary?.links || [],
      shopMega: byLocation['shop-mega']?.columns || [],
      collectionsPanel: byLocation['collections-panel']?.columns || [],
      footer: byLocation.footer?.columns || [],
    },
    settings: S.settings(settingsDoc),
    announcements: announcements.map((b) => b.title),
  });
});

// --- Admin -------------------------------------------------------------------

const getNavAdmin = asyncHandler(async (req, res) => {
  const doc = await NavMenu.findOne({ location: req.params.location });
  return ok(res, doc ? doc.toJSON() : { location: req.params.location, columns: [], links: [] });
});

/** Upsert, because a menu the admin has never edited has no document yet. */
const updateNav = asyncHandler(async (req, res) => {
  const doc = await NavMenu.findOneAndUpdate(
    { location: req.params.location },
    { $set: req.body },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return ok(res, doc.toJSON());
});

const getSettingsAdmin = asyncHandler(async (req, res) => ok(res, (await Settings.load()).toJSON()));

const updateSettings = asyncHandler(async (req, res) => {
  const doc = await Settings.load();

  // Merge per-block so a PATCH of `contact` does not wipe `seo`.
  for (const [block, value] of Object.entries(req.body)) {
    if (Array.isArray(value)) doc[block] = value;
    else if (value && typeof value === 'object') Object.assign(doc[block], value);
    else doc[block] = value;
  }

  await doc.save();
  return ok(res, doc.toJSON());
});

module.exports = {
  home,
  nav,
  settings,
  bootstrap,
  validateCoupon,
  estimateShipping,
  getNavAdmin,
  updateNav,
  getSettingsAdmin,
  updateSettings,
};
