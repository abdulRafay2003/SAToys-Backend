const { Product, Coupon, ShippingOption, Settings, Order } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * All order arithmetic, server-side.
 *
 * The cart lives in the browser (zustand + localStorage), so a checkout request
 * arrives as a list of product ids and quantities. Prices are re-read from the
 * database and every total recomputed here — a client-supplied price or total is
 * never used, because a client can send anything.
 *
 * Everything is integer minor units. There is no floating point in this file.
 */

/**
 * Resolve raw cart lines into priced, snapshotted order items.
 * @param {Array<{productId, variantId?, quantity}>} lines
 */
async function priceLines(lines) {
  if (!lines?.length) throw ApiError.badRequest('Your basket is empty');

  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = await Product.find({ _id: { $in: ids }, status: 'active' });
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = [];

  for (const line of lines) {
    const product = byId.get(String(line.productId));
    if (!product) {
      throw ApiError.badRequest(`A product in your basket is no longer available`, [
        { field: 'items', message: `Product ${line.productId} is unavailable` },
      ]);
    }

    const quantity = Math.max(1, Number(line.quantity) || 1);

    let variant = null;
    if (line.variantId) {
      variant = product.variants.id(line.variantId);
      if (!variant) {
        throw ApiError.badRequest(`That option is no longer available for ${product.name}`);
      }
    }

    // Stock is checked here rather than at add-to-cart, because the basket may
    // have sat in localStorage for a week.
    if (product.stock.trackInventory && !product.stock.preOrder) {
      const available = variant ? variant.stock : product.stock.quantity;
      if (available < quantity) {
        throw ApiError.conflict(
          available === 0
            ? `${product.name} has sold out`
            : `Only ${available} left of ${product.name}`,
          [{ field: 'items', message: 'Insufficient stock', productId: String(product._id) }],
        );
      }
    }

    const unitPrice = product.price + (variant?.priceDelta || 0);
    const primaryImage = product.images?.[0];

    items.push({
      product: product._id,
      name: product.name,
      slug: product.slug,
      sku: variant?.sku || product.sku || '',
      image: primaryImage?.url || null,
      imageSeed: primaryImage?.seed || product.slug,
      variantId: variant ? String(variant._id) : null,
      variantLabel: variant ? variant.label : null,
      unitPrice,
      quantity,
      lineTotal: unitPrice * quantity,
    });
  }

  return items;
}

const subtotalOf = (items) => items.reduce((sum, i) => sum + i.lineTotal, 0);

/**
 * Apply a coupon to a subtotal.
 * @returns {{discount: number, coupon: object}}  discount in minor units
 */
async function applyCoupon(code, subtotal, { userId } = {}) {
  if (!code) return { discount: 0, coupon: null, freeShipping: false };

  const doc = await Coupon.findOne({ code: String(code).toUpperCase().trim() });
  if (!doc) throw ApiError.badRequest('That code was not recognised');

  const { ok, reason } = doc.availability();
  if (!ok) throw ApiError.badRequest(reason);

  if (subtotal < doc.minSpend) {
    throw ApiError.badRequest(
      `That code needs a basket of at least £${(doc.minSpend / 100).toFixed(2)}`,
    );
  }

  if (doc.perUserLimit && userId) {
    const used = await Order.countDocuments({
      user: userId,
      'coupon.code': doc.code,
      'payment.status': { $nin: ['cancelled'] },
    });
    if (used >= doc.perUserLimit) {
      throw ApiError.badRequest('You have already used that code');
    }
  }

  let discount = 0;
  let freeShipping = false;

  if (doc.kind === 'percent') {
    discount = Math.round((subtotal * doc.value) / 100);
  } else if (doc.kind === 'fixed') {
    // Never discount below zero.
    discount = Math.min(doc.value, subtotal);
  } else if (doc.kind === 'free-shipping') {
    freeShipping = true;
  }

  return {
    discount,
    freeShipping,
    coupon: { code: doc.code, kind: doc.kind, value: doc.value, discountApplied: discount },
    doc,
  };
}

/**
 * Shipping cost after the free-shipping threshold and any free-shipping coupon.
 * The threshold lives in Settings, not a constant.
 *
 * Qualifying for free shipping makes *standard* delivery free — it does not
 * make every option free. Picking a faster option still costs whatever it
 * costs over standard, so "free shipping" can't be used to get express
 * delivery at no charge.
 */
async function resolveShipping(optionKey, { subtotalAfterDiscount, freeShipping }) {
  const settings = await Settings.load();
  const threshold = settings.commerce.freeShippingThreshold;

  if (!optionKey) return { price: 0, option: null };

  const option = await ShippingOption.findOne({ key: optionKey, isActive: true });
  if (!option) throw ApiError.badRequest('That delivery option is not available');

  const qualifiesFree = freeShipping || (threshold > 0 && subtotalAfterDiscount >= threshold);

  let price = option.price;
  if (qualifiesFree) {
    if (option.key === 'standard') {
      price = 0;
    } else {
      const standard = await ShippingOption.findOne({ key: 'standard', isActive: true });
      price = standard ? Math.max(0, option.price - standard.price) : 0;
    }
  }

  return {
    price,
    option,
    freeReason: qualifiesFree && price === 0 ? (freeShipping ? 'coupon' : 'threshold') : null,
  };
}

/**
 * Compose the full totals block.
 *
 * Tax is derived from a basis-point rate in Settings. When prices already
 * include tax (the UK default) the figure is reported for the invoice but not
 * added on top — adding it would charge VAT twice.
 */
async function computeTotals({ items, couponCode, shippingOptionKey, userId }) {
  const subtotal = subtotalOf(items);

  const { discount, coupon, freeShipping } = await applyCoupon(couponCode, subtotal, { userId });
  const afterDiscount = subtotal - discount;

  const shipping = await resolveShipping(shippingOptionKey, {
    subtotalAfterDiscount: afterDiscount,
    freeShipping,
  });

  const settings = await Settings.load();
  const { taxRateBps, pricesIncludeTax } = settings.commerce;

  const taxable = afterDiscount + shipping.price;
  let tax = 0;
  if (taxRateBps > 0) {
    tax = pricesIncludeTax
      ? Math.round(taxable - taxable / (1 + taxRateBps / 10000)) // extract
      : Math.round((taxable * taxRateBps) / 10000); // add
  }

  const grandTotal = pricesIncludeTax ? taxable : taxable + tax;

  return {
    totals: { subtotal, discount, shipping: shipping.price, tax, grandTotal },
    coupon,
    shippingOption: shipping.option,
    freeShippingReason: shipping.freeReason,
    currency: settings.commerce.currency,
  };
}

module.exports = { priceLines, computeTotals, applyCoupon, resolveShipping, subtotalOf };
