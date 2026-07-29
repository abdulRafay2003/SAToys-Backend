const crypto = require('crypto');
const admin = require('firebase-admin');
const { firebase } = require('../../config/env');
const logger = require('../../utils/logger');

/**
 * Firebase Cloud Storage driver.
 *
 * Uploads go admin panel → this API → Firebase, never browser → Firebase
 * directly. That means:
 *   • the service-account key stays on the server and never reaches a bundle,
 *   • Storage security rules are irrelevant (the Admin SDK bypasses them), so
 *     there are no rules to get subtly wrong,
 *   • the existing permission check on the upload route is the only gate, and
 *     it already runs before we get here.
 *
 * Objects are made readable via a Firebase download token rather than by making
 * the bucket public. The token is a UUID written into the object's metadata,
 * and the resulting URL is the same form `getDownloadURL()` returns in the
 * client SDK. This avoids touching bucket IAM — which is what makes uniform
 * bucket-level access (on by default for new buckets) reject `makePublic()`.
 */

let bucket = null;

function init() {
  if (bucket) return bucket;

  const { projectId, clientEmail, privateKey, storageBucket } = firebase;

  if (!projectId || !clientEmail || !privateKey || !storageBucket) {
    throw new Error(
      'Firebase storage is selected but not configured. Set FIREBASE_PROJECT_ID, ' +
        'FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY and FIREBASE_STORAGE_BUCKET.',
    );
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      storageBucket,
    });
  }

  bucket = admin.storage().bucket();
  logger.info('Firebase storage ready', { bucket: storageBucket });
  return bucket;
}

const keyFor = (folder, filename) => `${folder}/${filename}`;

/**
 * The public URL for an object with a download token.
 *
 * The object path is encoded whole — the slash between folder and filename has
 * to become %2F, which `encodeURIComponent` does and `encodeURI` does not.
 */
const downloadUrl = (key, token) =>
  `https://firebasestorage.googleapis.com/v0/b/${firebase.storageBucket}/o/` +
  `${encodeURIComponent(key)}?alt=media&token=${token}`;

async function save({ folder, filename, buffer, mimeType }) {
  const b = init();
  const key = keyFor(folder, filename);
  const token = crypto.randomUUID();

  const file = b.file(key);
  await file.save(buffer, {
    resumable: false,
    contentType: mimeType,
    metadata: {
      contentType: mimeType,
      // Catalogue images are immutable — the filename is unique per upload — so
      // they can be cached hard. Replacing an image produces a new key.
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  return { url: downloadUrl(key, token), key };
}

async function remove({ folder, filename }) {
  const b = init();
  const key = keyFor(folder, filename);

  try {
    await b.file(key).delete();
  } catch (error) {
    // Normalised so the controller can treat "gone" the same across drivers.
    if (error.code === 404) {
      const missing = new Error('File not found');
      missing.code = 'ENOENT';
      throw missing;
    }
    throw error;
  }
}

async function list(folder) {
  const b = init();
  const [files] = await b.getFiles({ prefix: `${folder}/` });

  return files
    .filter((f) => !f.name.endsWith('/'))
    .map((f) => {
      const token = f.metadata?.metadata?.firebaseStorageDownloadTokens;
      return {
        url: token ? downloadUrl(f.name, String(token).split(',')[0]) : f.publicUrl(),
        key: f.name,
        filename: f.name.slice(folder.length + 1),
        size: Number(f.metadata?.size || 0),
        uploadedAt: f.metadata?.timeCreated || new Date().toISOString(),
      };
    });
}

module.exports = { name: 'firebase', save, remove, list, init };
