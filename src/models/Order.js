const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { money, AddressSchema } = require('./shared');
const { ORDER_STATUSES, ORDER_STATUS_TRANSITIONS, PAYMENT_STATUSES } = require('../config/constants');

/**
 * Line items are a *snapshot*, not a join.
 *
 * The product ref is kept for reporting, but name, price, image and variant are
 * copied at purchase time. Re-pricing a product next month must not silently
 * rewrite what a customer was charged last month — that is an accounting
 * problem, not a display one.
 */
const OrderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    name: { type: String, trim: true, required: true },
    slug: { type: String, trim: true, required: true },
    sku: { type: String, trim: true, default: '' },
    image: { type: String, trim: true, default: null },
    /** Gradient fallback seed, so an order line renders even with no photography. */
    imageSeed: { type: String, trim: true, default: '' },

    variantId: { type: String, default: null },
    variantLabel: { type: String, trim: true, default: null },

    /** Per-unit, minor units, inclusive of any variant delta. */
    unitPrice: money({ required: true, min: 0 }),
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: money({ required: true, min: 0 }),
  },
  { _id: true },
);

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, index: true },

    /** Null for a guest checkout; `email` is then the only identifier. */
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    email: { type: String, trim: true, lowercase: true, required: true, index: true },
    phone: { type: String, trim: true, default: '' },

    items: {
      type: [OrderItemSchema],
      validate: { validator: (v) => v.length > 0, message: 'An order needs at least one item' },
    },

    /** All server-computed. A client-sent total is never trusted. */
    totals: {
      subtotal: money({ required: true, min: 0 }),
      discount: money({ default: 0, min: 0 }),
      shipping: money({ default: 0, min: 0 }),
      tax: money({ default: 0, min: 0 }),
      grandTotal: money({ required: true, min: 0 }),
    },
    currency: { type: String, default: 'PKR', uppercase: true },

    /** Snapshot — a coupon later edited or deleted must not alter history. */
    coupon: {
      code: { type: String, trim: true, uppercase: true, default: null },
      kind: { type: String, default: null },
      value: { type: Number, default: null },
      discountApplied: money({ default: 0, min: 0 }),
    },

    shipping: {
      optionKey: { type: String, trim: true, default: null },
      optionLabel: { type: String, trim: true, default: null },
      address: { type: AddressSchema, required: true },
      trackingNumber: { type: String, trim: true, default: null },
      carrier: { type: String, trim: true, default: null },
      shippedAt: { type: Date, default: null },
      deliveredAt: { type: Date, default: null },
      estimatedMinDays: { type: Number, default: null },
      estimatedMaxDays: { type: Number, default: null },
    },

    billingAddress: { type: AddressSchema, default: null },

    payment: {
      method: { type: String, trim: true, default: 'unpaid' },
      status: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid', index: true },
      reference: { type: String, trim: true, default: null },
      paidAt: { type: Date, default: null },
    },

    status: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    /** Append-only audit trail for the admin's order timeline. */
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: ORDER_STATUSES },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        note: { type: String, trim: true, default: null },
      },
    ],

    giftWrap: { type: Boolean, default: false },
    giftNote: { type: String, trim: true, default: null, maxlength: 500 },
    customerNote: { type: String, trim: true, default: null, maxlength: 1000 },
    /** Staff-only. Stripped from the storefront's view of an order. */
    internalNote: { type: String, trim: true, default: null, private: true },

    cancelledAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

serialise(OrderSchema);

OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ user: 1, createdAt: -1 });

/**
 * Human-readable, roughly sortable, and not guessable enough to enumerate:
 * SATOYS-<base36 day>-<6 random>. Collision is caught by the unique index.
 *
 * Only new orders take this prefix. Existing LUMO- numbers are left alone — an
 * order number is the identifier a customer quotes back to you, so rewriting it
 * would break every receipt and support thread already in the wild.
 */
OrderSchema.pre('validate', function preValidate() {
  if (!this.orderNumber) {
    const day = Math.floor(Date.now() / 86_400_000).toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.orderNumber = `SATOYS-${day}-${rand}`;
  }
});

/** Guards the admin's status dropdown server-side. */
OrderSchema.methods.canTransitionTo = function canTransitionTo(next) {
  if (next === this.status) return false;
  return (ORDER_STATUS_TRANSITIONS[this.status] || []).includes(next);
};

OrderSchema.methods.applyStatus = function applyStatus(next, { by = null, note = null } = {}) {
  this.status = next;
  this.statusHistory.push({ status: next, at: new Date(), by, note });

  if (next === 'shipped' && !this.shipping.shippedAt) this.shipping.shippedAt = new Date();
  if (next === 'delivered' && !this.shipping.deliveredAt) this.shipping.deliveredAt = new Date();
  if (next === 'cancelled') this.cancelledAt = new Date();
  if (next === 'refunded') {
    this.refundedAt = new Date();
    this.payment.status = 'refunded';
  }
  if (next === 'paid') {
    this.payment.status = 'paid';
    if (!this.payment.paidAt) this.payment.paidAt = new Date();
  }
  return this;
};

OrderSchema.virtual('itemCount').get(function itemCount() {
  return this.items.reduce((sum, i) => sum + i.quantity, 0);
});

module.exports = mongoose.model('Order', OrderSchema);
