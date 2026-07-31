const mongoose = require('mongoose');
const { Order, Product, Coupon, Settings } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, paginated } = require('../utils/respond');
const { parsePagination, paginate, escapeRegex } = require('../utils/query');
const { priceLines, computeTotals } = require('../services/pricing');
const sendEmail = require('../utils/sendEmail');
const S = require('../services/serialisers');

/**
 * POST /orders/quote — price a basket without committing to it.
 *
 * The cart and checkout pages need totals before an order exists. Sharing
 * computeTotals with the real checkout means the figure shown in the basket and
 * the figure charged cannot diverge.
 */
const quote = asyncHandler(async (req, res) => {
  const items = await priceLines(req.body.items);
  const result = await computeTotals({
    items,
    couponCode: req.body.couponCode,
    shippingOptionKey: req.body.shippingOptionKey,
    userId: req.user?._id,
  });

  const settings = await Settings.load();

  return ok(res, {
    items: items.map((i) => ({
      productId: String(i.product),
      name: i.name,
      slug: i.slug,
      image: i.image,
      imageSeed: i.imageSeed,
      variantId: i.variantId,
      variantLabel: i.variantLabel,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    totals: result.totals,
    coupon: result.coupon,
    currency: result.currency,
    freeShippingThreshold: settings.commerce.freeShippingThreshold,
    freeShippingReason: result.freeShippingReason,
  });
});

/**
 * POST /orders — checkout.
 *
 * Stock decrement and order creation run in a transaction so two people buying
 * the last unit cannot both succeed. On a standalone mongod (no replica set)
 * transactions are unavailable, so this degrades to a conditional update that
 * still refuses to take stock below zero.
 */
const create = asyncHandler(async (req, res) => {
  const body = req.body;
  const items = await priceLines(body.items);

  const { totals, coupon, shippingOption, currency } = await computeTotals({
    items,
    couponCode: body.couponCode,
    shippingOptionKey: body.shippingOptionKey,
    userId: req.user?._id,
  });

  const doc = new Order({
    user: req.user?._id || null,
    email: body.email.toLowerCase(),
    phone: body.phone || '',
    items,
    totals,
    currency,
    coupon: coupon || undefined,
    shipping: {
      optionKey: shippingOption?.key || null,
      optionLabel: shippingOption?.label || null,
      address: body.shippingAddress,
      estimatedMinDays: shippingOption?.minDays ?? null,
      estimatedMaxDays: shippingOption?.maxDays ?? null,
    },
    billingAddress: body.billingAddress || null,
    /**
     * Cash on delivery: the order is a real commitment but no money has moved,
     * so it stays `unpaid` until an admin marks it paid on collection. That is
     * exactly the `pending → paid` transition the admin already offers.
     */
    payment: { method: body.paymentMethod || 'cod', status: 'unpaid' },
    giftWrap: Boolean(body.giftWrap),
    giftNote: body.giftNote || null,
    customerNote: body.customerNote || null,
    status: 'pending',
    statusHistory: [{ status: 'pending', at: new Date() }],
  });

  const session = await mongoose.startSession();
  let usedTransaction = true;

  try {
    await session.withTransaction(async () => {
      await decrementStock(items, session);
      await doc.save({ session });
    });
  } catch (error) {
    if (isNoTransactionSupport(error)) {
      usedTransaction = false;
      await decrementStock(items, null);
      await doc.save();
    } else {
      throw error;
    }
  } finally {
    await session.endSession();
  }

  if (coupon) await Coupon.updateOne({ code: coupon.code }, { $inc: { usageCount: 1 } });

  // Sales counters feed the `popularity` sort and the dashboard.
  await Promise.all(
    items.map((i) =>
      Product.updateOne(
        { _id: i.product },
        { $inc: { salesCount: i.quantity, popularity: i.quantity * 2 } },
      ),
    ),
  );

  sendEmail({
    to: doc.email,
    subject: `Your SA Toys order ${doc.orderNumber}`,
    html: `<p>Thanks — we have your order.</p>
           <p>Payment: <strong>Cash on delivery</strong></p>
           <p>Order number: <strong>${doc.orderNumber}</strong></p>
           <p>Total: <strong>Rs ${(doc.totals.grandTotal / 100).toLocaleString('en-PK')}</strong></p>`,
  }).catch(() => {});

  return created(res, { ...S.order(doc), _transactional: usedTransaction });
});

const isNoTransactionSupport = (error) =>
  /Transaction numbers are only allowed|replica set|Transactions are not supported/i.test(
    error.message || '',
  );

/**
 * Conditional decrement: the filter itself asserts there is enough stock, so a
 * concurrent order that got there first causes a miss rather than a negative
 * quantity.
 */
async function decrementStock(items, session) {
  for (const item of items) {
    const filter = { _id: item.product, 'stock.trackInventory': true };
    const opts = session ? { session } : {};

    const product = await Product.findById(item.product).select('stock variants').setOptions(opts);
    if (!product || !product.stock.trackInventory || product.stock.preOrder) continue;

    if (item.variantId) {
      const result = await Product.updateOne(
        { ...filter, 'variants._id': item.variantId, 'variants.stock': { $gte: item.quantity } },
        { $inc: { 'variants.$.stock': -item.quantity, 'stock.quantity': -item.quantity } },
        opts,
      );
      if (!result.matchedCount) throw ApiError.conflict(`${item.name} just sold out`);
    } else {
      const result = await Product.updateOne(
        { ...filter, 'stock.quantity': { $gte: item.quantity } },
        { $inc: { 'stock.quantity': -item.quantity } },
        opts,
      );
      if (!result.matchedCount) throw ApiError.conflict(`${item.name} just sold out`);
    }

    // updateOne bypasses the pre-save hook, so the derived status is refreshed here.
    const fresh = await Product.findById(item.product).setOptions(opts);
    fresh.refreshStockStatus();
    await fresh.save(session ? { session, validateBeforeSave: false } : { validateBeforeSave: false });
  }
}

/** GET /orders/track/:orderNumber — no auth; email must match, as a weak secret. */
const track = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const doc = await Order.findOne({ orderNumber: req.params.orderNumber.toUpperCase() });

  /**
   * One response for both failures.
   *
   * Answering "no such order" differently from "wrong email" tells an attacker
   * which order numbers exist, which is the first half of reading someone
   * else's order. The pair is the credential; either half being wrong is the
   * same answer.
   */
  const matches = doc && q.email && doc.email === String(q.email).trim().toLowerCase();
  if (!matches) {
    // Constructed directly rather than via ApiError.notFound, which appends
    // "not found" to whatever it is given and would mangle a full sentence.
    throw new ApiError(
      404,
      'No order found with that number and email. Check both against your confirmation email.',
      { code: 'NOT_FOUND' },
    );
  }

  return ok(res, S.order(doc));
});

/** GET /me/orders */
const listMine = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.validatedQuery || req.query, 10);
  /**
   * Matched on user id *or* email.
   *
   * Checkout is guest-first, so most orders are placed before an account
   * exists and carry `user: null`. Filtering on the id alone would show
   * "no orders yet" to someone who had just ordered — the same misleading
   * emptiness this page exists to remove. The email is verified at sign-in,
   * so matching on it claims only orders the customer can already look up by
   * email through order tracking.
   */
  const result = await paginate(
    Order,
    { $or: [{ user: req.user._id }, { email: req.user.email }] },
    { page, limit, skip },
    { sort: { createdAt: -1 } },
  );
  return paginated(res, { ...result, items: result.items.map((o) => S.order(o)) });
});

const getMine = asyncHandler(async (req, res) => {
  // Same ownership rule as the list: id or verified email, so a guest order
  // opens rather than 404ing for the person who placed it.
  const doc = await Order.findOne({
    _id: req.params.id,
    $or: [{ user: req.user._id }, { email: req.user.email }],
  });
  if (!doc) throw ApiError.notFound('Order');
  return ok(res, S.order(doc));
});

// --- Admin -------------------------------------------------------------------

const listAdmin = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const filter = {};

  if (q.status) filter.status = q.status;
  if (q.paymentStatus) filter['payment.status'] = q.paymentStatus;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ orderNumber: rx }, { email: rx }, { 'shipping.address.lastName': rx }];
  }
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = new Date(q.from);
    if (q.to) filter.createdAt.$lte = new Date(q.to);
  }

  const { page, limit, skip } = parsePagination(q, 25);
  const result = await paginate(Order, filter, { page, limit, skip }, { sort: { createdAt: -1 } });

  return paginated(res, {
    ...result,
    items: result.items.map((o) => ({
      id: String(o._id),
      orderNumber: o.orderNumber,
      email: o.email,
      customerName: [o.shipping?.address?.firstName, o.shipping?.address?.lastName]
        .filter(Boolean)
        .join(' '),
      status: o.status,
      paymentStatus: o.payment?.status,
      grandTotal: o.totals?.grandTotal ?? 0,
      itemCount: (o.items || []).reduce((s, i) => s + i.quantity, 0),
      createdAt: S.iso(o.createdAt),
    })),
  });
});

const getAdmin = asyncHandler(async (req, res) => {
  const doc = await Order.findById(req.params.id).populate('user', 'firstName lastName email');
  if (!doc) throw ApiError.notFound('Order');
  return ok(res, S.order(doc, { includeInternal: true }));
});

/**
 * PATCH /admin/orders/:id/status — guarded by the transition table, so the API
 * refuses a jump the UI should not have offered (delivered → pending).
 */
const updateStatus = asyncHandler(async (req, res) => {
  const doc = await Order.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Order');

  const next = req.body.status;
  if (!doc.canTransitionTo(next)) {
    throw ApiError.badRequest(`An order cannot go from "${doc.status}" to "${next}"`);
  }

  // Cancelling or refunding returns stock to the shelf.
  if (['cancelled', 'refunded'].includes(next) && !['cancelled', 'refunded'].includes(doc.status)) {
    await Promise.all(
      doc.items.map((i) =>
        i.product
          ? Product.updateOne({ _id: i.product }, { $inc: { 'stock.quantity': i.quantity } })
          : null,
      ),
    );
  }

  doc.applyStatus(next, { by: req.user._id, note: req.body.note });
  await doc.save();

  sendEmail({
    to: doc.email,
    subject: `Your LUMO order ${doc.orderNumber} is now ${next}`,
    html: `<p>Your order <strong>${doc.orderNumber}</strong> is now <strong>${next}</strong>.</p>`,
  }).catch(() => {});

  return ok(res, S.order(doc, { includeInternal: true }));
});

const updateShipping = asyncHandler(async (req, res) => {
  const doc = await Order.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Order');

  Object.assign(doc.shipping, req.body);
  await doc.save();

  return ok(res, S.order(doc, { includeInternal: true }));
});

/** GET /admin/orders/:id/invoice — structured data; the admin renders/prints it. */
const invoice = asyncHandler(async (req, res) => {
  const doc = await Order.findById(req.params.id);
  if (!doc) throw ApiError.notFound('Order');

  const settings = await Settings.load();

  return ok(res, {
    order: S.order(doc, { includeInternal: true }),
    issuer: {
      name: settings.site.name,
      email: settings.contact.email,
      phone: settings.contact.phone,
      addressLines: settings.contact.addressLines,
      logo: settings.site.logo,
    },
    invoiceNumber: `INV-${doc.orderNumber}`,
    issuedAt: new Date().toISOString(),
    currencySymbol: settings.commerce.currencySymbol,
  });
});

module.exports = {
  quote,
  create,
  track,
  listMine,
  getMine,
  listAdmin,
  getAdmin,
  updateStatus,
  updateShipping,
  invoice,
};
