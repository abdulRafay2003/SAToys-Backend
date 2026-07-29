const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { MODERATION_STATUSES } = require('../config/constants');

/**
 * Backs `Review` in the storefront Zod, plus the moderation state the admin
 * panel manages.
 *
 * Only `status: "approved"` rows ever reach the storefront, and approving or
 * rejecting one recomputes the parent product's rating — which is what makes
 * "review approval immediately affects what users see" true rather than
 * eventually true.
 */
const ReviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    /** Null for a guest review left with just a name. */
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    author: { type: String, trim: true, required: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, private: true },

    rating: { type: Number, min: 1, max: 5, required: true },
    title: { type: String, trim: true, required: true, maxlength: 140 },
    body: { type: String, trim: true, required: true, maxlength: 4000 },

    /** "Bought for a 4-year-old" — shown under the author line when given. */
    boughtFor: { type: String, trim: true, default: null },
    /** Set when the reviewer has a delivered order containing this product. */
    verified: { type: Boolean, default: false },
    helpful: { type: Number, min: 0, default: 0 },

    status: { type: String, enum: MODERATION_STATUSES, default: 'pending', index: true },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    moderatedAt: { type: Date, default: null },
    /** Internal note for the rejecting admin. Never served publicly. */
    moderationNote: { type: String, trim: true, default: null, private: true },
  },
  { timestamps: true },
);

serialise(ReviewSchema);

// The storefront's per-product review list, and the admin moderation queue.
ReviewSchema.index({ product: 1, status: 1, createdAt: -1 });
ReviewSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Review', ReviewSchema);
