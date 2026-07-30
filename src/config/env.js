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

/**
 * Accepts a service-account private key in any of the forms it arrives in.
 *
 * The same key reaches this process three different ways, and only one of them
 * needs no work:
 *
 *   • `.env` file, double-quoted — dotenv strips the quotes and expands `\n`.
 *   • Host dashboard (Render, Vercel, Fly) — the field is stored verbatim, so
 *     any quotes you pasted become *literal characters* in the value and the
 *     `\n` stays a backslash and an n. Both have to be undone here, or the PEM
 *     parser fails with `DECODER routines::unsupported`, which names neither
 *     cause.
 *   • Already-real newlines — pasted into a multi-line field. Left alone.
 *
 * Normalising all three is what makes the key survive however it was entered.
 */
function normalisePrivateKey(raw) {
  if (!raw) return undefined;

  let key = raw.trim();

  // Quotes a dashboard stored literally, rather than as string delimiters.
  const quoted =
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"));
  if (quoted) key = key.slice(1, -1);

  // Escaped newlines back to real ones. A no-op when they are already real.
  key = key.replace(/\\n/g, '\n');

  return key.trim() + '\n';
}

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

  /**
   * Where uploaded images live: 'local' (disk) or 'firebase' (Cloud Storage).
   *
   * Defaults to local so the app runs with no credentials. Local disk does not
   * survive a redeploy on ephemeral hosts, so anything deployed should use
   * firebase.
   */
  storageDriver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),

  /**
   * Storefront cache invalidation. Both must be set for the call to happen;
   * unset simply means the storefront falls back to time-based revalidation.
   */
  revalidate: {
    url: process.env.STOREFRONT_REVALIDATE_URL,
    secret: process.env.REVALIDATE_SECRET,
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    /**
     * The service-account private key.
     *
     * In a .env file the key is one line with literal "\n" sequences, because a
     * real newline would end the value. Turning them back into newlines here is
     * the single most common cause of "invalid PEM" errors when this is missed.
     */
    privateKey: normalisePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
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
