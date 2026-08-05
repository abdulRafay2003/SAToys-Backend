const { z, objectId, money, address } = require('./common');
const C = require('../config/constants');

const couponShape = {
  code: z.string().trim().toUpperCase().min(2).max(40),
  kind: z.enum(C.COUPON_KINDS),
  value: z.number().min(0),
  description: z.string().trim().max(200).optional(),
  minSpend: money.optional(),
  isActive: z.boolean().optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  usageLimit: z.number().int().min(0).nullable().optional(),
  perUserLimit: z.number().int().min(0).nullable().optional(),
};

/** A percent coupon over 100 is a data-entry slip that would zero every order. */
const couponRules = (v) => {
  if (v.kind === 'percent' && v.value !== undefined && (v.value < 1 || v.value > 100)) return false;
  if (v.kind === 'fixed' && v.value !== undefined && !Number.isInteger(v.value)) return false;
  return true;
};
const couponMessage = {
  message: 'A percent coupon must be 1–100; a fixed coupon must be whole pence',
  path: ['value'],
};

const createCoupon = z.object(couponShape).refine(couponRules, couponMessage);
const updateCoupon = z.object(couponShape).partial().refine(couponRules, couponMessage);

const validateCoupon = z.object({
  code: z.string().trim().min(1, 'Enter a code'),
  subtotal: money,
});

const shippingShape = {
  key: z.string().trim().toLowerCase().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  price: money,
  minDays: z.number().int().min(0),
  maxDays: z.number().int().min(0),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
};

const daysOrdered = (v) =>
  v.minDays === undefined || v.maxDays === undefined || v.maxDays >= v.minDays;
const daysMessage = { message: 'maxDays must be at least minDays', path: ['maxDays'] };

const createShipping = z.object(shippingShape).refine(daysOrdered, daysMessage);
const updateShipping = z.object(shippingShape).partial().refine(daysOrdered, daysMessage);

const estimateShipping = z.object({
  subtotal: money,
  postcode: z.string().trim().optional(),
});

/** Checkout. Prices are deliberately absent — the server re-reads them. */
const createOrder = z.object({
  email: z.email('Enter a valid email address'),
  phone: z.string().trim().max(40).optional(),
  items: z
    .array(
      z.object({
        productId: objectId,
        variantId: z.string().optional().nullable(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1, 'Your basket is empty'),
  shippingAddress: address,
  billingAddress: address.optional().nullable(),
  shippingOptionKey: z.string().trim().min(1),
  /**
   * Only cash on delivery for now. An enum rather than a free string so adding
   * a gateway later is a deliberate change here, not an accident at a caller.
   */
  paymentMethod: z.enum(['cod']).default('cod'),
  couponCode: z.string().trim().optional().nullable(),
  giftWrap: z.boolean().optional(),
  giftNote: z.string().trim().max(500).optional().nullable(),
  customerNote: z.string().trim().max(1000).optional().nullable(),
});

/** Server-side quote for the cart page, using the same arithmetic as checkout. */
const quoteOrder = z.object({
  items: z
    .array(
      z.object({
        productId: objectId,
        variantId: z.string().optional().nullable(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1),
  shippingOptionKey: z.string().trim().optional().nullable(),
  couponCode: z.string().trim().optional().nullable(),
});

const updateOrderStatus = z.object({
  status: z.enum(C.ORDER_STATUSES),
  note: z.string().trim().max(500).optional(),
});

/**
 * The admin's payment-status control only ever offers `paid` or `cancelled`
 * — `unpaid` is the automatic starting state, not something to hand-set back
 * to, so it is deliberately excluded here even though it is a valid stored
 * value.
 */
const updateOrderPaymentStatus = z.object({
  status: z.enum(['paid', 'cancelled']),
  note: z.string().trim().max(500).optional(),
});

const updateOrderShipping = z.object({
  trackingNumber: z.string().trim().max(120).nullable().optional(),
  carrier: z.string().trim().max(80).nullable().optional(),
  address: address.optional(),
});

module.exports = {
  createCoupon,
  updateCoupon,
  validateCoupon,
  createShipping,
  updateShipping,
  estimateShipping,
  createOrder,
  quoteOrder,
  updateOrderStatus,
  updateOrderPaymentStatus,
  updateOrderShipping,
};
