const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const serialise = require('./plugins/serialise');
const { AddressSchema } = require('./shared');

/**
 * One user model for shoppers and staff alike — the difference is the Role they
 * point at. A separate Admin collection would mean duplicating auth, password
 * reset and session handling for no gain.
 */
const UserSchema = new mongoose.Schema(
  {
    /**
     * Optional because a passwordless account starts as an email and nothing
     * else — the customer supplies a name later, or at checkout.
     */
    firstName: { type: String, trim: true, default: '', maxlength: 60 },
    lastName: { type: String, trim: true, default: '', maxlength: 60 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
      unique: true,
      index: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'That does not look like an email address'],
    },
    phone: { type: String, trim: true, default: '' },

    /**
     * `select: false` keeps the hash out of every query that does not ask for
     * it; `private: true` strips it from serialisation even when it was loaded.
     * Both, because either alone has a hole.
     */
    /**
     * Null for accounts created through the email-code flow, which never set
     * one. `matchesPassword` treats a null hash as "no password login", so an
     * empty submission cannot authenticate such an account.
     */
    password: { type: String, default: null, minlength: 8, select: false, private: true },

    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true, index: true },

    addresses: [AddressSchema],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

    isActive: { type: Boolean, default: true, index: true },
    isEmailVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },

    // --- Credential recovery (hashed at rest; the plaintext only ever goes out by email) ---
    resetTokenHash: { type: String, default: null, select: false, private: true },
    resetTokenExpires: { type: Date, default: null, select: false, private: true },
    otpHash: { type: String, default: null, select: false, private: true },
    otpExpires: { type: Date, default: null, select: false, private: true },
    otpAttempts: { type: Number, default: 0, select: false, private: true },
  },
  { timestamps: true },
);

serialise(UserSchema);

UserSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
});

// Async middleware signals completion by resolving — Mongoose does not pass
// `next` to an async hook, so taking one would leave it undefined.
UserSchema.pre('save', async function preSave() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

UserSchema.methods.matchesPassword = async function matchesPassword(candidate) {
  // A passwordless account has no hash to compare against. Returning false
  // rather than letting bcrypt throw keeps "wrong password" and "this account
  // has no password" indistinguishable to a caller.
  if (!this.password || !candidate) return false;
  return bcrypt.compare(candidate, this.password);
};

/**
 * Recovery secrets are stored as SHA-256 digests. A leaked database then yields
 * no usable reset link. Returns the plaintext for the caller to email.
 */
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

UserSchema.methods.issueResetToken = function issueResetToken(ttlMinutes = 30) {
  const token = crypto.randomBytes(32).toString('hex');
  this.resetTokenHash = digest(token);
  this.resetTokenExpires = new Date(Date.now() + ttlMinutes * 60_000);
  return token;
};

UserSchema.methods.issueOtp = function issueOtp(code, ttlMinutes = 10) {
  this.otpHash = digest(code);
  this.otpExpires = new Date(Date.now() + ttlMinutes * 60_000);
  this.otpAttempts = 0;
  return code;
};

UserSchema.statics.digest = digest;

module.exports = mongoose.model('User', UserSchema);
