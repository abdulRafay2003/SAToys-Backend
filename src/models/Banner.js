const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { TONES, BANNER_PLACEMENTS } = require('../config/constants');

/**
 * One model for every strip of promotional copy, discriminated by `placement`.
 *
 * The storefront's rotating announcement bar (previously the hardcoded
 * ANNOUNCEMENTS array in data/config/nav.ts) is just `placement: "announcement"`
 * rows ordered by sortOrder.
 */
const BannerSchema = new mongoose.Schema(
  {
    placement: { type: String, enum: BANNER_PLACEMENTS, required: true, index: true },
    title: { type: String, trim: true, required: true, maxlength: 200 },
    subtitle: { type: String, trim: true, default: '', maxlength: 300 },
    image: { type: String, trim: true, default: null },
    /**
     * An optional video for a hero slide. When set it plays in place of the
     * image, which is kept as the poster frame and the fallback for anyone on
     * reduced motion or a connection that cannot afford it.
     */
    video: { type: String, trim: true, default: null },
    href: { type: String, trim: true, default: null },
    ctaLabel: { type: String, trim: true, default: null, maxlength: 60 },
    tone: { type: String, enum: TONES, default: 'coral' },

    /** Scoping for placement: "category-header". */
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },

    isActive: { type: Boolean, default: true, index: true },
    /** Null on either side means "no bound in that direction". */
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

serialise(BannerSchema);
BannerSchema.index({ placement: 1, isActive: 1, sortOrder: 1 });

/** Live *now* — active and inside its scheduling window. */
BannerSchema.statics.liveFilter = function liveFilter(now = new Date()) {
  return {
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
};

module.exports = mongoose.model('Banner', BannerSchema);
