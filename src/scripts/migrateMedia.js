require('../config/env');

const path = require('path');
const fs = require('fs/promises');
const mongoose = require('mongoose');
const { mongoUri, storageDriver, media } = require('../config/env');
const storage = require('../services/storage');

/**
 * Moves existing media to the active storage driver and rewrites every URL
 * that pointed at the old location.
 *
 *   npm run migrate:media -- --dry-run          # report only, nothing written
 *   npm run migrate:media                       # ./uploads → STORAGE_DRIVER
 *   npm run migrate:media -- --from=firebase    # retired, see parseFirebaseUrl
 *   npm run migrate:media -- --only=products    # one collection
 *
 * Switching STORAGE_DRIVER only changes where *new* uploads go. Records created
 * before the switch keep pointing at the old host, so they are copied across
 * here, keeping their folder and filename where the target allows, and every
 * document is walked in full rather than by a field list. That covers
 * `images[].url`, product and banner `video`, `seo.ogImage`, settings logos and
 * the image snapshot on old orders without anyone having to remember them.
 *
 * Safe to re-run: URLs already on the target are not matched, a file uploaded
 * by an interrupted earlier run is detected rather than duplicated, and the
 * source files are never deleted.
 */

/** Collections whose documents can contain media URLs. */
const COLLECTIONS = [
  'products',
  'categories',
  'brands',
  'collections',
  'banners',
  'homesections',
  'blogposts',
  'testimonials',
  'settings',
  // Order lines snapshot the product image at purchase time.
  'orders',
];

const MIME_FOR_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

/**
 * The name shape the API generates, and the only one the PHP receiver
 * accepts. Anything else (a hand-uploaded Firebase file) gets a fresh name.
 */
const GENERATED_NAME = /^\d{10,16}-[a-f0-9]{12}\.(jpe?g|png|webp|avif|gif|svg|mp4|webm|mov)$/;

const DOWNLOAD_TIMEOUT_MS = 120_000;
const CONCURRENCY = 4;

// --- Source URL recognition ----------------------------------------------------

/**
 * The Firebase bucket is retired: everything was migrated to media.satoys.store
 * on 2026-10-19, the project is back on the Spark plan (every download now
 * returns 402) and the driver is gone. This source is kept only so the history
 * of that run stays readable and a stray old URL is still recognised.
 *
 * Firebase served the same object at two URL shapes: the download-token form
 * the driver stored, and the plain GCS form `list()` falls back to.
 *   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded key>?alt=media&token=…
 *   https://storage.googleapis.com/<bucket>/<key>
 * Returns `{ folder, filename }` or null.
 */
function parseFirebaseUrl(value) {
  if (typeof value !== 'string') return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  let key = null;
  if (url.hostname === 'firebasestorage.googleapis.com') {
    const match = url.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
    if (match) key = decodeURIComponent(match[1]);
  } else if (url.hostname === 'storage.googleapis.com') {
    const match = url.pathname.match(/^\/[^/]+\/(.+)$/);
    if (match) key = decodeURIComponent(match[1]);
  }
  if (!key) return null;

  const parts = key.split('/').filter(Boolean);
  const filename = parts.pop();
  return filename ? { folder: parts.join('/'), filename } : null;
}

/** `…/uploads/<folder>/<file>`, as written by the local driver. */
function parseLocalUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/\/uploads\/([^/]+)\/([^/?#]+)$/);
  return match ? { folder: match[1], filename: decodeURIComponent(match[2]) } : null;
}

// --- Fetching the bytes ----------------------------------------------------------

async function readFirebase(sourceUrl) {
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) {
    const error = new Error(`download returned ${res.status}`);
    error.missing = res.status === 404 || res.status === 403;
    throw error;
  }
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
}

const LOCAL_ROOT = path.join(__dirname, '..', '..', 'uploads');

async function readLocal(sourceUrl, parsed) {
  try {
    const buffer = await fs.readFile(path.join(LOCAL_ROOT, parsed.folder, path.basename(parsed.filename)));
    return { buffer, contentType: '' };
  } catch (error) {
    const wrapped = new Error(`not on disk (${error.code})`);
    wrapped.missing = error.code === 'ENOENT';
    throw wrapped;
  }
}

const SOURCES = {
  firebase: { parse: parseFirebaseUrl, read: readFirebase },
  local: { parse: parseLocalUrl, read: readLocal },
};

// --- Planning a destination ------------------------------------------------------

/** Folder and name to store the file under on the target, plus its type. */
function destinationFor(parsed, contentType) {
  const folder = storage.FOLDERS.includes(parsed.folder) ? parsed.folder : 'misc';
  const ext = path.extname(parsed.filename).toLowerCase();
  const mimeType = MIME_FOR_EXT[ext] || contentType || 'application/octet-stream';
  const filename = GENERATED_NAME.test(parsed.filename)
    ? parsed.filename
    : storage.safeFilename(parsed.filename, mimeType);
  return { folder, filename, mimeType };
}

// --- The run ---------------------------------------------------------------------

/**
 * Copies one source URL to the target. Shared files (the same photo on a
 * product and in an old order) are copied once: the promise is cached by URL.
 */
function makeCopier({ source, dryRun, stats, onCopied }) {
  const cache = new Map();

  return (sourceUrl, parsed) => {
    if (cache.has(sourceUrl)) return cache.get(sourceUrl);

    const job = (async () => {
      if (dryRun) {
        const dest = destinationFor(parsed, '');
        stats.planned += 1;
        return { url: `(dry run) → ${dest.folder}/${dest.filename}`, dryRun: true };
      }

      let file;
      try {
        file = await source.read(sourceUrl, parsed);
      } catch (error) {
        (error.missing ? stats.missing : stats.failed).push({ url: sourceUrl, reason: error.message });
        return null;
      }

      const dest = destinationFor(parsed, file.contentType);
      try {
        const saved = await storage.save({ ...dest, buffer: file.buffer });
        stats.copied += 1;
        if (onCopied) await onCopied(sourceUrl, saved.url);
        return saved;
      } catch (error) {
        // An earlier interrupted run already stored this exact name, but did
        // not get as far as rewriting the document. The file is there; use it.
        if (error.status === 409) {
          stats.alreadyThere += 1;
          const key = `${dest.folder}/${dest.filename}`;
          const url = `${media.publicUrl}/${key}`;
          if (onCopied) await onCopied(sourceUrl, url);
          return { url, key };
        }
        stats.failed.push({ url: sourceUrl, reason: error.message });
        return null;
      }
    })();

    cache.set(sourceUrl, job);
    return job;
  };
}

/**
 * Walks any value, replacing every recognised source URL. Returns the new
 * value and whether anything changed. Plain objects and arrays only — ObjectIds,
 * Dates and Buffers are left as they are.
 */
async function rewrite(value, { source, copy }) {
  if (Array.isArray(value)) {
    let changed = false;
    const out = [];
    for (const item of value) {
      const result = await rewrite(item, { source, copy });
      out.push(result.value);
      changed ||= result.changed;
    }
    return { value: changed ? out : value, changed };
  }

  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    let changed = false;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const result = await rewrite(item, { source, copy });
      out[key] = result.value;
      changed ||= result.changed;
    }
    return { value: changed ? out : value, changed };
  }

  const parsed = source.parse(value);
  if (!parsed) return { value, changed: false };

  const saved = await copy(value, parsed);
  if (!saved || saved.dryRun) return { value, changed: Boolean(saved?.dryRun) };
  return { value: saved.url, changed: true };
}

/** Bounded parallelism over an array — enough to be quick, polite to both hosts. */
async function eachLimited(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}

/**
 * The migration proper, against anything shaped like a Mongo `Db` — so it can
 * be exercised without a database.
 */
/**
 * @param {object}   [opts.onCopied] - called with (sourceUrl, newUrl) for every
 *   file that now exists on the target — used to keep an old→new URL record
 *   so a run can be reversed.
 */
async function migrate(db, { from = 'local', dryRun = false, only = null, log = console.log, onCopied = null } = {}) {
  const source = SOURCES[from];
  if (!source) throw new Error(`Unknown --from "${from}" (use local or firebase)`);

  const stats = { planned: 0, copied: 0, alreadyThere: 0, missing: [], failed: [], documents: 0, byCollection: {} };
  const copy = makeCopier({ source, dryRun, stats, onCopied });

  for (const name of only ? [only] : COLLECTIONS) {
    const collection = db.collection(name);
    const docs = await collection.find({}).toArray();
    let changedHere = 0;

    await eachLimited(docs, CONCURRENCY, async (doc) => {
      const { _id, ...rest } = doc;
      const sets = {};

      // Per top-level field, so the update touches only what actually moved
      // and a concurrent admin edit to another field is not overwritten.
      for (const [field, value] of Object.entries(rest)) {
        const result = await rewrite(value, { source, copy });
        if (result.changed) sets[field] = result.value;
      }

      if (!Object.keys(sets).length) return;
      changedHere += 1;
      if (!dryRun) await collection.updateOne({ _id }, { $set: sets });
    });

    if (changedHere) {
      stats.byCollection[name] = changedHere;
      log(`  ${name}: ${changedHere} document(s) ${dryRun ? 'would change' : 'updated'}`);
    }
    stats.documents += changedHere;
  }

  return stats;
}

function parseArgs(argv) {
  const args = { from: 'local', dryRun: false, only: null };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('--from=')) args.from = arg.slice(7);
    else if (arg.startsWith('--only=')) args.only = arg.slice(7);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (storageDriver === args.from || storageDriver === 'local') {
    console.error(
      `STORAGE_DRIVER is "${storageDriver}" — set it to the destination (hostinger or ` +
        'hostinger-http) and configure it first.',
    );
    process.exit(1);
  }
  if (args.only && !COLLECTIONS.includes(args.only)) {
    console.error(`--only must be one of: ${COLLECTIONS.join(', ')}`);
    process.exit(1);
  }

  if (!args.dryRun) storage.init();
  await mongoose.connect(mongoUri);

  console.log(
    `${args.dryRun ? 'DRY RUN — ' : ''}Migrating ${args.from} media → ${storage.name}\n${'─'.repeat(56)}`,
  );

  const stats = await migrate(mongoose.connection.db, args);

  console.log('─'.repeat(56));
  if (args.dryRun) {
    console.log(`${stats.planned} file(s) would be copied; ${stats.documents} document(s) would change.`);
  } else {
    console.log(
      `${stats.copied} file(s) copied, ${stats.alreadyThere} already present, ` +
        `${stats.documents} document(s) rewritten.`,
    );
  }
  for (const [label, list] of [['missing at source (URL left unchanged)', stats.missing], ['FAILED (URL left unchanged — re-run to retry)', stats.failed]]) {
    if (!list.length) continue;
    console.log(`\n${list.length} ${label}:`);
    for (const item of list) console.log(`  ${item.url}\n    ${item.reason}`);
  }
  if (!args.dryRun && stats.documents) {
    console.log('\nNext: purge the storefront cache so pages stop serving the old URLs.');
  }

  await mongoose.connection.close();
  if (stats.failed.length) process.exitCode = 2;
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('\nMigration failed:', error.message);
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  });
}

module.exports = { migrate, parseFirebaseUrl, parseLocalUrl, destinationFor, COLLECTIONS };
