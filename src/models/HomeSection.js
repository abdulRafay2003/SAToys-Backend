const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { TONES, HOME_SECTION_TYPES, RAIL_SOURCES } = require('../config/constants');

/**
 * The homepage as data.
 *
 * The storefront's home page was a fixed JSX layout; this model turns it into an
 * ordered list of sections the admin can reorder, toggle and re-point. `config`
 * is a loose subdocument because each `type` needs different keys — validated
 * per-type in validators/homeSection.js rather than with a union schema, which
 * Mongoose cannot express cleanly.
 */
const HomeSectionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: HOME_SECTION_TYPES, required: true },
    /** Internal label for the admin list — not necessarily rendered. */
    name: { type: String, trim: true, required: true, maxlength: 120 },

    heading: { type: String, trim: true, default: '' },
    subheading: { type: String, trim: true, default: '' },
    body: { type: String, trim: true, default: '' },
    image: { type: String, trim: true, default: null },
    tone: { type: String, enum: TONES, default: 'coral' },

    ctaLabel: { type: String, trim: true, default: null },
    ctaHref: { type: String, trim: true, default: null },
    secondaryCtaLabel: { type: String, trim: true, default: null },
    secondaryCtaHref: { type: String, trim: true, default: null },

    config: {
      /** product-rail: where the rail's products come from. */
      source: { type: String, enum: RAIL_SOURCES, default: 'featured' },
      /** product-rail with source "manual". */
      products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
      /** collection-tiles: which collections to show, in order. */
      collections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collection' }],
      limit: { type: Number, default: 8, min: 1, max: 24 },
      /** hero: whether to mount the WebGL scene. */
      showCanvas: { type: Boolean, default: false },
    },

    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

serialise(HomeSectionSchema);
HomeSectionSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('HomeSection', HomeSectionSchema);
