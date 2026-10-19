const dotenv = require("dotenv");

dotenv.config();

/**
 * Fail fast on missing configuration rather than at the first request that
 * needs it. A server that boots without JWT_SECRET is a server that issues
 * unverifiable tokens.
 */
const required = ["MONGODB_URI", "JWT_SECRET"];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`[config] Missing required env vars: ${missing.join(", ")}`);
  console.error("[config] Copy .env.example to .env and fill it in.");
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error("[config] JWT_SECRET must be at least 32 characters.");
  process.exit(1);
}

const toList = (value, fallback) =>
  (value ? value.split(",") : fallback).map((s) => s.trim()).filter(Boolean);

module.exports = {
  env: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT) || 5000,

  mongoUri: process.env.MONGODB_URI,

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRE || "7d",
  },

  /** Storefront and admin both call this API from the browser. */
  corsOrigins: toList(process.env.CORS_ORIGINS, [
    "http://localhost:3000",
    "http://localhost:3001",
  ]),

  storefrontUrl: process.env.STOREFRONT_URL || "http://localhost:3000",
  adminUrl: process.env.ADMIN_URL || "http://localhost:3001",

  /** Public base for uploaded files, so responses carry absolute URLs. */
  publicUrl:
    process.env.PUBLIC_URL ||
    `http://localhost:${Number(process.env.PORT) || 5000}`,

  upload: {
    maxFileSizeMb: Number(process.env.UPLOAD_MAX_FILE_SIZE_MB) || 5,
    maxFiles: Number(process.env.UPLOAD_MAX_FILES) || 12,
    /** Video is a separate, larger limit — a 5MB image cap is unusable for a product clip. */
    maxVideoSizeMb: Number(process.env.UPLOAD_MAX_VIDEO_SIZE_MB) || 50,
  },

  /**
   * Where uploaded images live: 'local' (this app's ./uploads, dev only),
   * 'hostinger' (the media site's folder on the same Hostinger account),
   * or 'hostinger-http' (the same folder via its PHP receiver).
   *
   * Defaults to local so the app runs with no credentials. Hostinger replaces
   * the app folder on every deployment, so production uses 'hostinger'.
   */
  storageDriver: (process.env.STORAGE_DRIVER || "local").toLowerCase(),

  /**
   * Storefront cache invalidation. Both must be set for the call to happen;
   * unset simply means the storefront falls back to time-based revalidation.
   */
  revalidate: {
    url: process.env.STOREFRONT_REVALIDATE_URL,
    secret: process.env.REVALIDATE_SECRET,
  },

  /**
   * Hostinger media site. Files are served from `publicUrl` either way; how
   * they get there depends on the driver (see hostinger/media/README.md):
   *   • STORAGE_DRIVER=hostinger      — written straight to `root` on disk
   *   • STORAGE_DRIVER=hostinger-http — POSTed to the PHP receiver at
   *     `uploadUrl`, signed with `secret`
   */
  media: {
    /** Absolute path to the media site's web root, e.g. /home/u123/domains/media.satoys.store/public_html */
    root: process.env.MEDIA_ROOT,
    uploadUrl: process.env.MEDIA_UPLOAD_URL,
    secret: process.env.MEDIA_UPLOAD_SECRET,
    // Trailing slashes stripped so `${publicUrl}/${key}` never doubles one.
    publicUrl: (process.env.MEDIA_PUBLIC_URL || "").replace(/\/+$/, "") || undefined,
  },

  mail: {
    /**
     * Brevo's transactional HTTP API, not SMTP — many hosts (Render, most PaaS
     * free tiers) block outbound SMTP ports, which made raw Gmail SMTP hang until
     * connection-timeout on every send. An HTTPS API call has no such problem.
     */
    apiKey: process.env.BREVO_API_KEY,
    fromEmail: process.env.EMAIL_FROM_ADDRESS,
    fromName: process.env.EMAIL_FROM_NAME || "SA Toys",
    /** Email is optional in dev — flows degrade to logging the OTP. */
    enabled: Boolean(
      process.env.BREVO_API_KEY && process.env.EMAIL_FROM_ADDRESS,
    ),
  },
};
