const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { money } = require('./shared');

/**
 * Backs `ShippingOption` in the storefront Zod.
 *
 * `key` is the stable identifier the storefront and orders reference
 * ("standard", "express"), kept separate from the Mongo id so an option can be
 * deleted and recreated without orphaning historical orders.
 */
const ShippingOptionSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, lowercase: true, required: true, unique: true, index: true },
    label: { type: String, trim: true, required: true, maxlength: 80 },
    description: { type: String, trim: true, default: '', maxlength: 200 },
    price: money({ required: true, min: 0 }),
    minDays: { type: Number, min: 0, required: true },
    maxDays: { type: Number, min: 0, required: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

serialise(ShippingOptionSchema);
ShippingOptionSchema.index({ isActive: 1, sortOrder: 1 });

ShippingOptionSchema.pre('validate', function preValidate() {
  if (this.maxDays < this.minDays) throw new Error('maxDays must be at least minDays');
});

module.exports = mongoose.model('ShippingOption', ShippingOptionSchema);
