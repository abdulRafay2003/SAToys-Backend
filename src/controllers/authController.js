const { User, Role } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created } = require('../utils/respond');
const generateToken = require('../utils/generateToken');
const generateOTP = require('../utils/generateOTP');
const sendEmail = require('../utils/sendEmail');
const logger = require('../utils/logger');
const S = require('../services/serialisers');
const { storefrontUrl, adminUrl, mail } = require('../config/env');

const sessionPayload = (user) => ({
  token: generateToken(user._id),
  user: S.customer(user),
});

/** POST /auth/register — storefront sign-up. Always the customer role. */
const register = asyncHandler(async (req, res) => {
  const exists = await User.exists({ email: req.body.email });
  if (exists) throw ApiError.conflict('An account with that email already exists');

  const customerRole = await Role.findOne({ slug: 'customer' });
  if (!customerRole) throw new Error('The customer role is missing — run `npm run seed:roles`');

  const user = await User.create({ ...req.body, role: customerRole._id });
  await user.populate('role');

  return created(res, sessionPayload(user));
});

/**
 * POST /auth/login
 *
 * One message for "no such account" and "wrong password". Distinguishing them
 * turns the endpoint into an account-enumeration oracle.
 */
const login = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+password').populate('role');

  if (!user || !(await user.matchesPassword(req.body.password))) {
    throw ApiError.unauthenticated('That email and password do not match');
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return ok(res, sessionPayload(user));
});

/**
 * POST /auth/admin/login — same credentials, but refuses accounts with no
 * admin permissions, so a customer token can never be minted by the admin panel.
 */
const adminLogin = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+password').populate('role');

  if (!user || !(await user.matchesPassword(req.body.password))) {
    throw ApiError.unauthenticated('That email and password do not match');
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');
  if (!(user.role?.permissions || []).length) {
    throw ApiError.forbidden('This account does not have admin access');
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return ok(res, sessionPayload(user));
});

const me = asyncHandler(async (req, res) => ok(res, S.customer(req.user)));

/**
 * POST /auth/forgot-password
 *
 * Responds identically whether or not the address exists — again, to avoid
 * confirming which emails have accounts.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const generic = {
    message: 'If that address has an account, a reset link is on its way.',
  };

  const user = await User.findOne({ email: req.body.email });
  if (!user) return ok(res, generic);

  const token = user.issueResetToken();
  await user.save({ validateBeforeSave: false });

  const base = req.body.context === 'admin' ? adminUrl : storefrontUrl;
  const link = `${base}/reset-password?token=${token}`;

  if (mail.enabled) {
    await sendEmail({
      to: user.email,
      subject: 'Reset your LUMO password',
      html: `<p>Hello ${user.firstName},</p>
             <p>Use the link below to set a new password. It expires in 30 minutes.</p>
             <p><a href="${link}">Reset your password</a></p>
             <p>If you did not ask for this, you can ignore this email.</p>`,
    });
  } else {
    // Development without SMTP configured: log rather than silently doing nothing.
    logger.warn('Email is not configured — password reset link follows', { link });
  }

  return ok(res, generic);
});

const resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({
    resetTokenHash: User.digest(req.body.token),
    resetTokenExpires: { $gt: new Date() },
  }).select('+resetTokenHash +resetTokenExpires');

  if (!user) throw ApiError.badRequest('That reset link is invalid or has expired');

  user.password = req.body.password;
  user.resetTokenHash = null;
  user.resetTokenExpires = null;
  await user.save();
  await user.populate('role');

  return ok(res, sessionPayload(user));
});

/** POST /auth/send-otp — email verification. */
const sendOtp = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return ok(res, { message: 'If that address has an account, a code is on its way.' });

  const code = generateOTP();
  user.issueOtp(code);
  await user.save({ validateBeforeSave: false });

  if (mail.enabled) {
    await sendEmail({
      to: user.email,
      subject: `${code} is your LUMO verification code`,
      html: `<p>Your code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
    });
  } else {
    logger.warn('Email is not configured — OTP follows', { email: user.email, code });
  }

  return ok(res, { message: 'If that address has an account, a code is on its way.' });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select(
    '+otpHash +otpExpires +otpAttempts',
  );
  if (!user) throw ApiError.badRequest('That code is invalid or has expired');

  // Cap attempts so a 6-digit code cannot be brute-forced.
  if (user.otpAttempts >= 5) {
    throw ApiError.badRequest('Too many attempts. Request a new code.');
  }

  const valid =
    user.otpHash === User.digest(req.body.code) && user.otpExpires && user.otpExpires > new Date();

  if (!valid) {
    user.otpAttempts += 1;
    await user.save({ validateBeforeSave: false });
    throw ApiError.badRequest('That code is invalid or has expired');
  }

  user.isEmailVerified = true;
  user.otpHash = null;
  user.otpExpires = null;
  user.otpAttempts = 0;
  await user.save({ validateBeforeSave: false });
  await user.populate('role');

  return ok(res, sessionPayload(user));
});

const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchesPassword(req.body.currentPassword))) {
    throw ApiError.badRequest('Your current password is not correct');
  }

  user.password = req.body.newPassword;
  await user.save();

  return ok(res, { message: 'Your password has been changed.' });
});

module.exports = {
  register,
  login,
  adminLogin,
  me,
  forgotPassword,
  resetPassword,
  sendOtp,
  verifyOtp,
  changePassword,
};
