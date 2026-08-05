/**
 * Shared enums. These mirror `Toys-Website/src/data/schemas/index.ts` exactly —
 * when a value is added here it must be added there, and vice versa. Anything
 * that drifts shows up as a product the storefront's Zod parse rejects.
 */

/** The six "toy box" colour families. Drives tints across the whole storefront. */
const TONES = ['coral', 'sunny', 'sky', 'mint', 'grape', 'bubble'];

const BADGES = ['new', 'bestseller', 'limited', 'exclusive', 'sale', 'eco', 'award'];

/**
 * Only these four are authored. `new`, `bestseller` and `sale` are derived
 * (see DOMAIN.md) and are stripped from admin input.
 */
const AUTHORED_BADGES = ['limited', 'exclusive', 'eco', 'award'];

const STOCK_STATUSES = ['in-stock', 'low-stock', 'sold-out', 'pre-order'];

const IMAGE_TYPES = ['studio', 'lifestyle', 'detail', 'scale'];

const VARIANT_KINDS = ['colour', 'size', 'edition'];

const FAQ_GROUPS = ['delivery', 'safety', 'gifting', 'products'];

const COUPON_KINDS = ['percent', 'fixed', 'free-shipping'];

const PUBLISH_STATUSES = ['draft', 'active', 'archived'];

const MODERATION_STATUSES = ['pending', 'approved', 'rejected'];

/**
 * Fulfillment only. Payment is tracked entirely separately, on `payment.status`
 * below — an order's fulfillment stage and whether it has been paid for are
 * independent facts, and conflating them (a "paid" *order status*, a
 * "cancelled" *order status*) was the thing that made a single flat dropdown
 * confusing to operate.
 */
const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered'];

/** Which status may follow which. Guards the admin's status control server-side. */
const ORDER_STATUS_TRANSITIONS = {
  pending: ['processing'],
  processing: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
};

/**
 * `unpaid` is the automatic starting state for a cash-on-delivery order; the
 * admin's payment-status control only ever asks for `paid` or `cancelled`.
 */
const PAYMENT_STATUSES = ['unpaid', 'paid', 'cancelled'];

const PAYMENT_STATUS_TRANSITIONS = {
  unpaid: ['paid', 'cancelled'],
  paid: ['cancelled'],
  cancelled: [],
};

const BANNER_PLACEMENTS = ['announcement', 'hero', 'promo-strip', 'category-header'];

const HOME_SECTION_TYPES = [
  'hero',
  'collection-tiles',
  'product-rail',
  'promo',
  'testimonials',
  'newsletter',
  'rich-text',
];

/** Where a product rail gets its products from. */
const RAIL_SOURCES = ['featured', 'new-arrivals', 'best-sellers', 'trending', 'manual'];

const NAV_LOCATIONS = ['primary', 'shop-mega', 'collections-panel', 'footer'];

/** Sort keys, mirroring SORTS in `Toys-Website/src/lib/catalogue.ts`. */
const PRODUCT_SORTS = {
  popular: { popularity: -1 },
  new: { createdAt: -1 },
  'price-asc': { price: 1 },
  'price-desc': { price: -1 },
  rating: { 'rating.average': -1, 'rating.count': -1 },
  'name-asc': { name: 1 },
  'age-asc': { 'ageRange.min': 1 },
  // `discount` cannot be expressed as a plain sort — the controller adds a
  // computed field for it. Listed here so the key validates.
  discount: null,
};

module.exports = {
  TONES,
  BADGES,
  AUTHORED_BADGES,
  STOCK_STATUSES,
  IMAGE_TYPES,
  VARIANT_KINDS,
  FAQ_GROUPS,
  COUPON_KINDS,
  PUBLISH_STATUSES,
  MODERATION_STATUSES,
  ORDER_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_TRANSITIONS,
  BANNER_PLACEMENTS,
  HOME_SECTION_TYPES,
  RAIL_SOURCES,
  NAV_LOCATIONS,
  PRODUCT_SORTS,
};
