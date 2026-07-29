const jwt = require('jsonwebtoken');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { jwt: jwtConfig } = require('../config/env');
const { SUPER } = require('../config/permissions');

const readToken = (req) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  // The admin panel may prefer an httpOnly cookie over localStorage.
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
};

const loadUser = async (token) => {
  const decoded = jwt.verify(token, jwtConfig.secret);
  const user = await User.findById(decoded.id).populate('role');
  if (!user) throw ApiError.unauthenticated('Account no longer exists');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');
  return user;
};

/** Hard gate: 401 unless a valid token resolves to an active user. */
const protect = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
  if (!token) throw ApiError.unauthenticated('Sign in to continue');
  req.user = await loadUser(token);
  next();
});

/**
 * Soft gate: attaches req.user when a token is present and valid, but never
 * rejects. Used where a response varies by signed-in state — a review can be
 * marked verified, an order looked up without a token.
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = readToken(req);
  if (token) {
    try {
      req.user = await loadUser(token);
    } catch {
      req.user = undefined;
    }
  }
  next();
});

const holds = (user, permission) => {
  const perms = user.role?.permissions || [];
  return perms.includes(SUPER) || perms.includes(permission);
};

/**
 * Requires *all* listed permissions. Use after `protect`.
 *
 * Permission strings rather than role names: a new role created in the admin
 * panel then works without a code change, which is the point of having a Role
 * model at all.
 */
const requirePermission = (...permissions) =>
  asyncHandler(async (req, res, next) => {
    if (!req.user) throw ApiError.unauthenticated('Sign in to continue');

    const missing = permissions.filter((p) => !holds(req.user, p));
    if (missing.length) {
      throw ApiError.forbidden(`Missing permission: ${missing.join(', ')}`);
    }
    next();
  });

/** Any admin-panel access at all — a role with a non-empty permission list. */
const requireStaff = asyncHandler(async (req, res, next) => {
  if (!req.user) throw ApiError.unauthenticated('Sign in to continue');
  if (!(req.user.role?.permissions || []).length) {
    throw ApiError.forbidden('This account has no admin access');
  }
  next();
});

module.exports = { protect, optionalAuth, requirePermission, requireStaff, holds };
