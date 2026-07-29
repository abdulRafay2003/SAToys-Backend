const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { SeoSchema } = require('./shared');
const { TONES } = require('../config/constants');

/** Backs `Brand` in the storefront Zod. `story` is the long-form brand-page copy. */
const BrandSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, maxlength: 80 },
    slug: { type: String, trim: true, lowercase: true, required: true, unique: true, index: true },
    blurb: { type: String, trim: true, default: '', maxlength: 300 },
    story: { type: String, trim: true, default: '' },
    origin: { type: String, trim: true, default: '' },
    founded: {
      type: Number,
      min: 1600,
      max: new Date().getFullYear(),
      default: null,
    },
    tone: { type: String, enum: TONES, default: 'coral' },
    logo: { type: String, trim: true, default: null },

    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

serialise(BrandSchema);
BrandSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('Brand', BrandSchema);
