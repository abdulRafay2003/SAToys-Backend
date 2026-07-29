const { User, Role, Order, Product } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, noContent, paginated } = require('../utils/respond');
const { parsePagination, paginate, escapeRegex } = require('../utils/query');
const { toSlug, uniqueSlug } = require('../utils/slug');
const S = require('../services/serialisers');

// =============================================================================
// Account (the signed-in customer, storefront)
// =============================================================================

const updateProfile = asyncHandler(async (req, res) => {
  Object.assign(req.user, req.body);
  await req.user.save();
  return ok(res, S.customer(req.user));
});

const listAddresses = asyncHandler(async (req, res) => ok(res, req.user.addresses));

/** Only one address can be the default, so setting one clears the rest. */
const addAddress = asyncHandler(async (req, res) => {
  if (req.body.isDefault) req.user.addresses.forEach((a) => { a.isDefault = false; });
  req.user.addresses.push(req.body);
  await req.user.save();
  return created(res, req.user.addresses);
});

const updateAddress = asyncHandler(async (req, res) => {
  const address = req.user.addresses.id(req.params.addressId);
  if (!address) throw ApiError.notFound('Address');

  if (req.body.isDefault) req.user.addresses.forEach((a) => { a.isDefault = false; });
  Object.assign(address, req.body);
  await req.user.save();

  return ok(res, req.user.addresses);
});

const removeAddress = asyncHandler(async (req, res) => {
  const address = req.user.addresses.id(req.params.addressId);
  if (!address) throw ApiError.notFound('Address');
  address.deleteOne();
  await req.user.save();
  return ok(res, req.user.addresses);
});

// --- Wishlist ---------------------------------------------------------------

const getWishlist = asyncHandler(async (req, res) => {
  await req.user.populate({
    path: 'wishlist',
    match: { status: 'active' },
    populate: [{ path: 'brand', select: 'slug name' }, { path: 'categories', select: 'slug name' }],
  });
  return ok(res, req.user.wishlist.map(S.productCard));
});

/** $addToSet rather than push — adding twice must not duplicate the entry. */
const addToWishlist = asyncHandler(async (req, res) => {
  const exists = await Product.exists({ _id: req.params.productId });
  if (!exists) throw ApiError.notFound('Product');

  await User.updateOne({ _id: req.user._id }, { $addToSet: { wishlist: req.params.productId } });
  return ok(res, { productId: req.params.productId, inWishlist: true });
});

const removeFromWishlist = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { wishlist: req.params.productId } });
  return ok(res, { productId: req.params.productId, inWishlist: false });
});

// =============================================================================
// Admin — customers and staff
// =============================================================================

const listCustomers = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const filter = {};

  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
  }
  if (q.isActive !== undefined) filter.isActive = q.isActive;
  if (q.role) filter.role = q.role;

  // "Customers" means shoppers; staff have their own screen.
  if (q.staff === true) {
    const staffRoles = await Role.find({ permissions: { $ne: [] } }).select('_id');
    filter.role = { $in: staffRoles.map((r) => r._id) };
  } else if (q.staff === false) {
    const customerRole = await Role.findOne({ slug: 'customer' }).select('_id');
    if (customerRole) filter.role = customerRole._id;
  }

  const { page, limit, skip } = parsePagination(q, 25);
  const result = await paginate(
    User,
    filter,
    { page, limit, skip },
    { sort: { createdAt: -1 }, populate: { path: 'role', select: 'name slug permissions' } },
  );

  // Order totals per customer, in one aggregation rather than N queries.
  const ids = result.items.map((u) => u._id);
  const stats = await Order.aggregate([
    { $match: { user: { $in: ids }, status: { $nin: ['cancelled'] } } },
    { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$totals.grandTotal' } } },
  ]);
  const byUser = new Map(stats.map((s) => [String(s._id), s]));

  return paginated(res, {
    ...result,
    items: result.items.map((u) => ({
      ...S.customer(u),
      orderCount: byUser.get(String(u._id))?.orders || 0,
      totalSpent: byUser.get(String(u._id))?.spent || 0,
    })),
  });
});

const getCustomer = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).populate('role');
  if (!user) throw ApiError.notFound('Customer');

  const [orders, stats] = await Promise.all([
    Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(50).lean(),
    Order.aggregate([
      { $match: { user: user._id, status: { $nin: ['cancelled'] } } },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          spent: { $sum: '$totals.grandTotal' },
          lastOrderAt: { $max: '$createdAt' },
        },
      },
    ]),
  ]);

  return ok(res, {
    ...S.customer(user),
    orders: orders.map((o) => S.order(o)),
    stats: {
      orderCount: stats[0]?.orders || 0,
      totalSpent: stats[0]?.spent || 0,
      averageOrder: stats[0]?.orders ? Math.round(stats[0].spent / stats[0].orders) : 0,
      lastOrderAt: S.iso(stats[0]?.lastOrderAt),
    },
  });
});

const createStaff = asyncHandler(async (req, res) => {
  if (await User.exists({ email: req.body.email })) {
    throw ApiError.conflict('An account with that email already exists');
  }
  const role = await Role.findById(req.body.role);
  if (!role) throw ApiError.badRequest('That role does not exist');

  const user = await User.create(req.body);
  await user.populate('role');
  return created(res, S.customer(user));
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User');

  // Locking yourself out is a support ticket, so it is refused here.
  if (String(user._id) === String(req.user._id)) {
    if (req.body.isActive === false) throw ApiError.badRequest('You cannot deactivate your own account');
    if (req.body.role && String(req.body.role) !== String(user.role)) {
      throw ApiError.badRequest('You cannot change your own role');
    }
  }

  Object.assign(user, req.body);
  await user.save();
  await user.populate('role');

  return ok(res, S.customer(user));
});

const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User');
  if (String(user._id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot delete your own account');
  }

  // Customers with order history are deactivated, not deleted — the orders
  // reference them and an anonymous order history is worse than an inactive user.
  if (await Order.exists({ user: user._id })) {
    user.isActive = false;
    await user.save();
    return ok(res, { deactivated: true, message: 'This customer has orders, so the account was deactivated instead of deleted.' });
  }

  await user.deleteOne();
  return noContent(res);
});

// --- Roles -------------------------------------------------------------------

const listRoles = asyncHandler(async (req, res) => {
  const roles = await Role.find().sort({ isSystem: -1, name: 1 }).lean();
  const counts = await User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]);
  const byRole = new Map(counts.map((c) => [String(c._id), c.n]));

  return ok(
    res,
    roles.map((r) => ({
      id: String(r._id),
      name: r.name,
      slug: r.slug,
      description: r.description,
      permissions: r.permissions,
      isSystem: r.isSystem,
      userCount: byRole.get(String(r._id)) || 0,
    })),
  );
});

const createRole = asyncHandler(async (req, res) => {
  const slug = await uniqueSlug(Role, toSlug(req.body.slug || req.body.name));
  const role = await Role.create({ ...req.body, slug, isSystem: false });
  return created(res, role.toJSON());
});

const updateRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw ApiError.notFound('Role');

  // Renaming a system role is fine; changing what it can do is not, because the
  // seeded roles are what the permission checks assume.
  if (role.isSystem && req.body.permissions) {
    throw ApiError.badRequest(`"${role.name}" is a built-in role and its permissions cannot be changed. Create a new role instead.`);
  }

  Object.assign(role, req.body);
  await role.save();
  return ok(res, role.toJSON());
});

const deleteRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw ApiError.notFound('Role');
  if (role.isSystem) throw ApiError.badRequest(`"${role.name}" is a built-in role and cannot be deleted`);

  const inUse = await User.countDocuments({ role: role._id });
  if (inUse) {
    throw ApiError.conflict(`${inUse} account${inUse === 1 ? ' is' : 's are'} using this role. Reassign them first.`);
  }

  await role.deleteOne();
  return noContent(res);
});

/** The permission catalogue, so the admin can render checkboxes without hardcoding. */
const listPermissions = asyncHandler(async (req, res) => {
  const { RESOURCES, ACTIONS } = require('../config/permissions');
  return ok(res, { resources: RESOURCES, actions: ACTIONS });
});

module.exports = {
  updateProfile,
  listAddresses,
  addAddress,
  updateAddress,
  removeAddress,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  listCustomers,
  getCustomer,
  createStaff,
  updateUser,
  deleteUser,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listPermissions,
};
