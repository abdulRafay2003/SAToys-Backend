const { Order, Product, User, Review, Category } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/respond');

/**
 * Dashboard analytics.
 *
 * Cancelled and refunded orders are excluded from every revenue figure — a
 * dashboard that counts refunds as income is worse than no dashboard.
 */
const REVENUE_STATUSES = ['paid', 'processing', 'shipped', 'delivered'];
const revenueMatch = (from, to) => ({
  status: { $in: REVENUE_STATUSES },
  ...(from || to
    ? { createdAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } }
    : {}),
});

const parseRange = (q) => {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 29 * 864e5);
  return { from, to };
};

const sumRevenue = async (match) => {
  const [row] = await Order.aggregate([
    { $match: match },
    { $group: { _id: null, revenue: { $sum: '$totals.grandTotal' }, orders: { $sum: 1 } } },
  ]);
  return { revenue: row?.revenue || 0, orders: row?.orders || 0 };
};

/** Percentage change, guarding the divide-by-zero that a first trading period gives. */
const delta = (current, previous) => {
  if (!previous) return current ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
};

/** GET /admin/analytics/overview — the dashboard's headline tiles. */
const overview = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.validatedQuery || req.query);
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span);

  const [current, previous, customers, prevCustomers, productCount, lowStock, pendingReviews, pendingOrders] =
    await Promise.all([
      sumRevenue(revenueMatch(from, to)),
      sumRevenue(revenueMatch(prevFrom, from)),
      User.countDocuments({ createdAt: { $gte: from, $lte: to } }),
      User.countDocuments({ createdAt: { $gte: prevFrom, $lt: from } }),
      Product.countDocuments({ status: 'active' }),
      Product.countDocuments({
        'stock.trackInventory': true,
        $expr: { $lte: ['$stock.quantity', '$stock.lowStockThreshold'] },
      }),
      Review.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'pending' }),
    ]);

  return ok(res, {
    range: { from: from.toISOString(), to: to.toISOString() },
    revenue: {
      value: current.revenue,
      previous: previous.revenue,
      changePercent: delta(current.revenue, previous.revenue),
    },
    orders: {
      value: current.orders,
      previous: previous.orders,
      changePercent: delta(current.orders, previous.orders),
    },
    averageOrderValue: {
      value: current.orders ? Math.round(current.revenue / current.orders) : 0,
      previous: previous.orders ? Math.round(previous.revenue / previous.orders) : 0,
    },
    newCustomers: {
      value: customers,
      previous: prevCustomers,
      changePercent: delta(customers, prevCustomers),
    },
    activeProducts: productCount,
    actionable: { lowStock, pendingReviews, pendingOrders },
  });
});

/** GET /admin/analytics/sales — a daily series for the dashboard chart. */
const sales = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.validatedQuery || req.query);

  const rows = await Order.aggregate([
    { $match: revenueMatch(from, to) },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$totals.grandTotal' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill the gaps: a chart that skips days with no sales misreads as a plateau.
  const byDay = new Map(rows.map((r) => [r._id, r]));
  const series = [];
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 864e5)) {
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, revenue: byDay.get(key)?.revenue || 0, orders: byDay.get(key)?.orders || 0 });
  }

  return ok(res, series);
});

/** GET /admin/analytics/products — best sellers and what is not moving. */
const products = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.validatedQuery || req.query);

  const [top, byCategory] = await Promise.all([
    Order.aggregate([
      { $match: revenueMatch(from, to) },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          slug: { $first: '$items.slug' },
          units: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),
    Order.aggregate([
      { $match: revenueMatch(from, to) },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'p',
        },
      },
      { $unwind: '$p' },
      { $unwind: '$p.categories' },
      { $group: { _id: '$p.categories', revenue: { $sum: '$items.lineTotal' }, units: { $sum: '$items.quantity' } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'c' } },
      { $unwind: '$c' },
      { $project: { _id: 0, name: '$c.name', slug: '$c.slug', revenue: 1, units: 1 } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),
  ]);

  return ok(res, {
    topSellers: top.map((t) => ({
      productId: t._id ? String(t._id) : null,
      name: t.name,
      slug: t.slug,
      units: t.units,
      revenue: t.revenue,
    })),
    byCategory,
  });
});

/** GET /admin/analytics/customers — new vs returning, and the best customers. */
const customers = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req.validatedQuery || req.query);

  const [topCustomers, repeat, total] = await Promise.all([
    Order.aggregate([
      { $match: { ...revenueMatch(from, to), user: { $ne: null } } },
      { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$totals.grandTotal' } } },
      { $sort: { spent: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
      { $unwind: '$u' },
      {
        $project: {
          _id: 0,
          id: { $toString: '$_id' },
          name: { $concat: ['$u.firstName', ' ', { $ifNull: ['$u.lastName', ''] }] },
          email: '$u.email',
          orders: 1,
          spent: 1,
        },
      },
    ]),
    Order.aggregate([
      { $match: { ...revenueMatch(), user: { $ne: null } } },
      { $group: { _id: '$user', n: { $sum: 1 } } },
      { $group: { _id: null, repeat: { $sum: { $cond: [{ $gt: ['$n', 1] }, 1, 0] } }, all: { $sum: 1 } } },
    ]),
    User.countDocuments(),
  ]);

  return ok(res, {
    topCustomers,
    totalCustomers: total,
    repeatCustomers: repeat[0]?.repeat || 0,
    repeatRate: repeat[0]?.all ? Number(((repeat[0].repeat / repeat[0].all) * 100).toFixed(1)) : 0,
  });
});

/** GET /admin/analytics/orders — status breakdown for the pipeline widget. */
const orders = asyncHandler(async (req, res) => {
  const rows = await Order.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 }, value: { $sum: '$totals.grandTotal' } } },
  ]);

  return ok(
    res,
    rows.map((r) => ({ status: r._id, count: r.n, value: r.value })),
  );
});

module.exports = { overview, sales, products, customers, orders };
