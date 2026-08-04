const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { money, SeoSchema, ImageSchema, AgeRangeSchema } = require('./shared');
const {
  BADGES,
  STOCK_STATUSES,
  VARIANT_KINDS,
  PUBLISH_STATUSES,
} = require('../config/constants');

/**
 * Backs `Product` in Toys-Website/src/data/schemas/index.ts.
 *
 * Relations are stored as ObjectIds for integrity but the controllers project
 * them back to slugs (`brandSlug`, `categorySlugs[]`) because that is the
 * vocabulary of the storefront's Zod contract and of its URLs.
 */

const VariantSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true },
    kind: { type: String, enum: VARIANT_KINDS, required: true },
    /** Hex, only meaningful for `kind: "colour"`. Rendered as a swatch. */
    swatch: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => !v || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v),
        message: 'swatch must be a hex colour like #ff8a73',
      },
    },
    sku: { type: String, trim: true, required: true },
    /** Added to the parent price. May be negative. */
    priceDelta: money({ default: 0 }),
    stock: { type: Number, min: 0, default: 0 },
  },
  { _id: true },
);

const SpecsSchema = new mongoose.Schema(
  {
    dimensions: { type: String, trim: true, default: '' },
    weight: { type: String, trim: true, default: '' },
    materials: [{ type: String, trim: true }],
    batteries: { type: String, trim: true, default: 'None' },
    pieces: { type: Number, default: null },
    safety: [{ type: String, trim: true }],
    origin: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const ProductSchema = new mongoose.Schema(
  {
    // --- Identity -----------------------------------------------------------
    name: { type: String, trim: true, required: [true, 'A product needs a name'], maxlength: 140 },
    slug: { type: String, trim: true, lowercase: true, required: true, unique: true, index: true },
    sku: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    tagline: { type: String, trim: true, default: '', maxlength: 200 },
    description: { type: String, trim: true, default: '' },

    // --- Taxonomy -----------------------------------------------------------
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category', index: true }],
    collections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collection', index: true }],

    // --- Money (minor units) ------------------------------------------------
    price: money({ required: [true, 'A product needs a price'], min: 0 }),
    /** The struck-through "was" price. Presence of a higher value derives the `sale` badge. */
    compareAtPrice: money({ default: null, min: 0 }),
    /** Internal only — never serialised to the storefront. Powers margin analytics. */
    costPrice: money({ default: null, min: 0, private: true }),
    currency: { type: String, default: 'PKR', uppercase: true },

    // --- Media --------------------------------------------------------------
    images: [ImageSchema],
    hasModel3d: { type: Boolean, default: false },
    /** An optional product demo video, uploaded from the admin. */
    video: { type: String, trim: true, default: null },

    // --- Options ------------------------------------------------------------
    variants: [VariantSchema],
    /** Free-form spec pairs beyond the fixed `specs` block. */
    attributes: [
      {
        _id: false,
        name: { type: String, trim: true },
        value: { type: String, trim: true },
      },
    ],
    specs: { type: SpecsSchema, default: () => ({}) },
    inTheBox: [{ type: String, trim: true }],
    ageRange: { type: AgeRangeSchema, default: () => ({ min: 0, max: 99 }) },

    // --- Inventory ----------------------------------------------------------
    stock: {
      quantity: { type: Number, min: 0, default: 0 },
      /** Below this, status derives to `low-stock`. */
      lowStockThreshold: { type: Number, min: 0, default: 5 },
      /** Authored: forces `pre-order` regardless of quantity. */
      preOrder: { type: Boolean, default: false },
      restockDate: { type: Date, default: null },
      /** Derived on save — see refreshStockStatus below. Not admin-writable. */
      status: { type: String, enum: STOCK_STATUSES, default: 'sold-out' },
      /** When false, the storefront may sell past zero. */
      trackInventory: { type: Boolean, default: true },
    },

    // --- Social proof (derived from approved reviews) ------------------------
    rating: {
      average: { type: Number, min: 0, max: 5, default: 0 },
      count: { type: Number, min: 0, default: 0 },
      /** Index 0 = one star … index 4 = five stars. */
      distribution: {
        type: [Number],
        default: () => [0, 0, 0, 0, 0],
        validate: {
          validator: (v) => v.length === 5,
          message: 'distribution must have exactly 5 buckets',
        },
      },
    },

    // --- Merchandising ------------------------------------------------------
    /** Authored subset only; derived badges are added on read. */
    badges: [{ type: String, enum: BADGES }],
    tags: [{ type: String, trim: true, lowercase: true, index: true }],
    isFeatured: { type: Boolean, default: false, index: true },
    isTrending: { type: Boolean, default: false, index: true },
    isNewArrival: { type: Boolean, default: false, index: true },
    isBestSeller: { type: Boolean, default: false, index: true },
    /** Rolling score from sales + views. Recomputed, not authored. */
    popularity: { type: Number, default: 0, index: true },
    viewCount: { type: Number, default: 0 },
    salesCount: { type: Number, default: 0 },

    related: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    bundle: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

    // --- Publishing ---------------------------------------------------------
    status: { type: String, enum: PUBLISH_STATUSES, default: 'draft', index: true },
    publishedAt: { type: Date, default: null },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

serialise(ProductSchema);

// --- Indexes ---------------------------------------------------------------
// Text search across the fields the storefront's `q` filter searches.
ProductSchema.index(
  { name: 'text', tagline: 'text', description: 'text', tags: 'text' },
  { weights: { name: 10, tagline: 5, tags: 3, description: 1 }, name: 'product_search' },
);
// The storefront's default listing: active products by popularity.
ProductSchema.index({ status: 1, popularity: -1 });
ProductSchema.index({ status: 1, price: 1 });
ProductSchema.index({ status: 1, createdAt: -1 });

// --- Derived state ---------------------------------------------------------

/**
 * Stock status is never written directly — it is a function of quantity,
 * threshold and the pre-order flag. Keeping it derived means the admin cannot
 * save a product marked "in stock" with a quantity of zero.
 */
ProductSchema.methods.refreshStockStatus = function refreshStockStatus() {
  const s = this.stock;
  if (s.preOrder) s.status = 'pre-order';
  else if (!s.trackInventory) s.status = 'in-stock';
  else if (s.quantity <= 0) s.status = 'sold-out';
  else if (s.quantity <= s.lowStockThreshold) s.status = 'low-stock';
  else s.status = 'in-stock';
  return s.status;
};

ProductSchema.pre('save', function preSave() {
  this.refreshStockStatus();

  // A sale price above the sticker price is a data-entry slip, not a discount.
  if (this.compareAtPrice !== null && this.compareAtPrice !== undefined) {
    if (this.compareAtPrice <= this.price) this.compareAtPrice = null;
  }

  if (this.status === 'active' && !this.publishedAt) this.publishedAt = new Date();
});

/** Percentage saved, or 0. Used by the `discount` sort and the sale badge. */
ProductSchema.virtual('discountPercent').get(function discountPercent() {
  if (!this.compareAtPrice || this.compareAtPrice <= this.price) return 0;
  return Math.round(((this.compareAtPrice - this.price) / this.compareAtPrice) * 100);
});

ProductSchema.virtual('inStock').get(function inStock() {
  return this.stock.status !== 'sold-out';
});

module.exports = mongoose.model('Product', ProductSchema);
