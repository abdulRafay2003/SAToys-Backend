const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { money } = require('./shared');
const { COUPON_KINDS } = require('../config/constants');

/**
 * Backs `Coupon` in the storefront Zod, plus the lifecycle fields a real coupon
 * needs. `value` means different things per kind, which is why it is validated
 * against `kind` rather than with a blanket range.
 */
const CouponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
      unique: true,
      index: true,
      maxlength: 40,
    },
    kind: { type: String, enum: COUPON_KINDS, required: true },
    /** percent → 1–100. fixed → minor units. free-shipping → ignored. */
    value: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true, default: '', maxlength: 200 },
    minSpend: money({ default: 0, min: 0 }),

    isActive: { type: Boolean, default: true, index: true },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, default: null },

    /** Null means unlimited. */
    usageLimit: { type: Number, default: null, min: 0 },
    usageCount: { type: Number, default: 0, min: 0 },
    perUserLimit: { type: Number, default: null, min: 0 },
  },
  { timestamps: true },
);

serialise(CouponSchema);

// Promise-style: Mongoose 9 does not pass `next` to document validate hooks.
CouponSchema.pre('validate', function preValidate() {
  if (this.kind === 'percent' && (this.value < 1 || this.value > 100)) {
    throw new Error('A percent coupon must be between 1 and 100');
  }
  if (this.kind === 'fixed' && !Number.isInteger(this.value)) {
    throw new Error('A fixed coupon must be an integer in minor units (pence)');
  }
  if (this.kind === 'free-shipping') this.value = 0;

  if (this.validFrom && this.validUntil && this.validFrom > this.validUntil) {
    throw new Error('validFrom must be before validUntil');
  }
});

/**
 * Whether the coupon may be applied at all, ignoring cart specifics.
 * Returns a reason rather than a bare boolean so the storefront can say *why*.
 */
CouponSchema.methods.availability = function availability(now = new Date()) {
  if (!this.isActive) return { ok: false, reason: 'That code is no longer active' };
  if (this.validFrom && now < this.validFrom) return { ok: false, reason: 'That code is not active yet' };
  if (this.validUntil && now > this.validUntil) return { ok: false, reason: 'That code has expired' };
  if (this.usageLimit !== null && this.usageCount >= this.usageLimit) {
    return { ok: false, reason: 'That code has been fully redeemed' };
  }
  return { ok: true };
};

module.exports = mongoose.model('Coupon', CouponSchema);
