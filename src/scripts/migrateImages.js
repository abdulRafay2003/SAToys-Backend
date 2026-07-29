require('../config/env');

const path = require('path');
const fs = require('fs/promises');
const mongoose = require('mongoose');
const { mongoUri, storageDriver } = require('../config/env');
const storage = require('../services/storage');

/**
 * Moves images uploaded under the local disk driver into the configured remote
 * driver, and rewrites every document that referenced them.
 *
 * Switching STORAGE_DRIVER only changes where *new* uploads go. Without this,
 * products photographed before the switch keep pointing at
 * `http://localhost:5001/uploads/…`, which resolves to nothing in production.
 *
 * Idempotent: a URL that is already remote is skipped, so re-running is safe
 * and a partial run can simply be repeated.
 */

const LOCAL_ROOT = path.join(__dirname, '..', '..', 'uploads');

/** Documents and the fields within them that can hold an image URL. */
const TARGETS = [
  { collection: 'products', fields: ['images.$.url', 'seo.ogImage'] },
  { collection: 'categories', fields: ['image', 'icon', 'seo.ogImage'] },
  { collection: 'brands', fields: ['logo', 'seo.ogImage'] },
  { collection: 'collections', fields: ['heroImage', 'seo.ogImage'] },
  { collection: 'banners', fields: ['image'] },
  { collection: 'homesections', fields: ['image'] },
  { collection: 'blogposts', fields: ['coverImage', 'seo.ogImage'] },
  { collection: 'testimonials', fields: ['avatar'] },
  { collection: 'settings', fields: ['site.logo', 'site.favicon', 'seo.ogImage'] },
];

/** A URL this script is responsible for moving. */
const isLocalUrl = (value) =>
  typeof value === 'string' && /\/uploads\/[^/]+\/[^/?#]+$/.test(value);

/** "…/uploads/products/123-abc.png" → { folder, filename } */
function parseLocalUrl(url) {
  const match = url.match(/\/uploads\/([^/]+)\/([^/?#]+)$/);
  return match ? { folder: match[1], filename: match[2] } : null;
}

const uploaded = new Map(); // local url -> remote url, so a shared file uploads once
let missing = 0;

async function toRemote(localUrl) {
  if (uploaded.has(localUrl)) return uploaded.get(localUrl);

  const parsed = parseLocalUrl(localUrl);
  if (!parsed) return null;

  const diskPath = path.join(LOCAL_ROOT, parsed.folder, parsed.filename);

  let buffer;
  try {
    buffer = await fs.readFile(diskPath);
  } catch {
    // The database references a file that is no longer on disk. Leaving the URL
    // untouched is better than nulling it — the record still says what it
    // expected, and the storefront falls back to its gradient.
    console.warn(`  ! missing on disk, left as-is: ${parsed.folder}/${parsed.filename}`);
    missing += 1;
    return null;
  }

  const ext = path.extname(parsed.filename).toLowerCase();
  const mimeType =
    { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
      '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';

  const { url } = await storage.save({
    folder: parsed.folder,
    filename: parsed.filename,
    buffer,
    mimeType,
  });

  uploaded.set(localUrl, url);
  return url;
}

/** Walks a document, replacing every local URL it finds. Returns true if changed. */
async function rewrite(value) {
  if (Array.isArray(value)) {
    let changed = false;
    for (let i = 0; i < value.length; i++) {
      const result = await rewrite(value[i]);
      if (result.changed) {
        value[i] = result.value;
        changed = true;
      }
    }
    return { value, changed };
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    let changed = false;
    for (const key of Object.keys(value)) {
      const result = await rewrite(value[key]);
      if (result.changed) {
        value[key] = result.value;
        changed = true;
      }
    }
    return { value, changed };
  }

  if (isLocalUrl(value)) {
    const remote = await toRemote(value);
    if (remote) return { value: remote, changed: true };
  }

  return { value, changed: false };
}

async function run() {
  if (storageDriver === 'local') {
    console.error(
      'STORAGE_DRIVER is "local" — there is nothing to migrate to.\n' +
        'Set STORAGE_DRIVER=firebase (and its credentials) first.',
    );
    process.exit(1);
  }

  storage.init();
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  console.log(`Migrating local images → ${storage.name}\n${'─'.repeat(52)}`);

  let documentsChanged = 0;

  for (const target of TARGETS) {
    const collection = db.collection(target.collection);
    const docs = await collection.find({}).toArray();
    let changedHere = 0;

    for (const doc of docs) {
      const { _id, ...rest } = doc;
      const result = await rewrite(rest);
      if (!result.changed) continue;

      await collection.updateOne({ _id }, { $set: result.value });
      changedHere += 1;
    }

    if (changedHere) console.log(`  ${target.collection}: ${changedHere} updated`);
    documentsChanged += changedHere;
  }

  console.log(`${'─'.repeat(52)}`);
  console.log(`${uploaded.size} file(s) uploaded, ${documentsChanged} document(s) rewritten`);
  if (missing) console.log(`${missing} reference(s) had no file on disk and were left unchanged`);

  await mongoose.connection.close();
}

run().catch((error) => {
  console.error('\nMigration failed:', error.message);
  process.exit(1);
});
