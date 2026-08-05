const mongoose = require('mongoose');

/**
 * Subdocument shapes reused across models. Defined once so a change to, say,
 * the SEO block cannot land on Product and miss Category.
 */

/**
 * Money is always an integer in minor units (pence). Mongoose has no integer
 * type, so this is enforced with a validator — otherwise `19.99` silently
 * becomes a price of 19.99 pence.
 */
const money = (options = {}) => ({
  type: Number,
  validate: {
    // Mongoose skips validators for `undefined` but still runs them for `null`,
    // so a nullable price (compareAtPrice, costPrice) has to be allowed through
    // explicitly — otherwise "no sale price" fails validation.
    validator: (v) => v === null || v === undefined || Number.isInteger(v),
    message: (props) => `${props.path} must be a whole number of pence, got ${props.value}`,
  },
  ...options,
});

const SeoSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 70 },
    description: { type: String, trim: true, maxlength: 200 },
    keywords: [{ type: String, trim: true }],
    ogImage: { type: String, trim: true },
    noIndex: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * An uploaded asset. `url` is null until something is uploaded; `seed` drives
 * the storefront's deterministic gradient placeholder so a product with no
 * photography still renders as a coloured tile rather than a grey box
 * (see Toys-Website/src/components/common/product-image.tsx).
 */
const ImageSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true, default: null },
    seed: { type: String, trim: true, required: true },
    alt: { type: String, trim: true, default: '' },
    type: {
      type: String,
      enum: ['studio', 'lifestyle', 'detail', 'scale'],
      default: 'studio',
    },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false },
);

const AgeRangeSchema = new mongoose.Schema(
  {
    min: { type: Number, min: 0, required: true },
    max: { type: Number, min: 0, required: true },
  },
  { _id: false },
);

const AddressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    firstName: { type: String, trim: true, required: true },
    lastName: { type: String, trim: true, required: true },
    line1: { type: String, trim: true, required: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true, required: true },
    county: { type: String, trim: true },
    // Optional: plenty of Pakistani addresses are delivered on landmarks
    // rather than a postcode.
    postcode: { type: String, trim: true, default: '', uppercase: true },
    country: { type: String, trim: true, default: 'United Kingdom' },
    phone: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
);

module.exports = { money, SeoSchema, ImageSchema, AgeRangeSchema, AddressSchema };
