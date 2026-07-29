const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { SeoSchema } = require('./shared');
const { TONES } = require('../config/constants');

/**
 * Backs `Collection` in the storefront Zod.
 *
 * `chapters` are the narrative blocks the collection page reveals on scroll —
 * an ordered array of heading/body pairs rather than one rich-text blob, because
 * the storefront animates each block independently.
 */
const ChapterSchema = new mongoose.Schema(
  {
    heading: { type: String, trim: true, required: true, maxlength: 120 },
    body: { type: String, trim: true, required: true },
  },
  { _id: false },
);

const CollectionSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, maxlength: 80 },
    slug: { type: String, trim: true, lowercase: true, required: true, unique: true, index: true },
    blurb: { type: String, trim: true, default: '', maxlength: 300 },
    tone: { type: String, enum: TONES, default: 'coral' },
    chapters: [ChapterSchema],

    heroImage: { type: String, trim: true, default: null },

    /** Seasonal collections drive the /seasonal/[slug] route. */
    isSeasonal: { type: Boolean, default: false, index: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },

    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

serialise(CollectionSchema);
CollectionSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('Collection', CollectionSchema);
