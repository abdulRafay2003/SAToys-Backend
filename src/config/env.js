const dotenv = require('dotenv');

dotenv.config();

/**
 * Fail fast on missing configuration rather than at the first request that
 * needs it. A server that boots without JWT_SECRET is a server that issues
 * unverifiable tokens.
 */
const required = ['MONGODB_URI', 'JWT_SECRET'];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`[config] Missing required env vars: ${missing.join(', ')}`);
  console.error('[config] Copy .env.example to .env and fill it in.');
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('[config] JWT_SECRET must be at least 32 characters.');
  process.exit(1);
}

const toList = (value, fallback) =>
  (value ? value.split(',') : fallback).map((s) => s.trim()).filter(Boolean);

module.exports = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 5000,

  mongoUri: process.env.MONGODB_URI,

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRE || '7d',
  },

  /** Storefront and admin both call this API from the browser. */
  corsOrigins: toList(process.env.CORS_ORIGINS, [
    'http://localhost:3000',
    'http://localhost:3001',
  ]),

  storefrontUrl: process.env.STOREFRONT_URL || 'http://localhost:3000',
  adminUrl: process.env.ADMIN_URL || 'http://localhost:3001',

  /** Public base for uploaded files, so responses carry absolute URLs. */
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${Number(process.env.PORT) || 5000}`,

  upload: {
    maxFileSizeMb: Number(process.env.UPLOAD_MAX_FILE_SIZE_MB) || 5,
    maxFiles: Number(process.env.UPLOAD_MAX_FILES) || 12,
  },

  mail: {
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    fromName: process.env.EMAIL_FROM_NAME || 'LUMO',
    /** Email is optional in dev — flows degrade to logging the OTP. */
    enabled: Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER),
  },
};
