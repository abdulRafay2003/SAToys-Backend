const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');
const { media } = require('../../config/env');
const logger = require('../../utils/logger');

/**
 * Hostinger media driver, direct to disk (STORAGE_DRIVER=hostinger).
 *
 * The API runs as a Node.js web app inside the same Hostinger account as the
 * media site, so it can simply write into that site's web root — no HTTP hop,
 * no shared secret, nothing to keep in sync on the far side:
 *
 *   admin → this API → writes ${MEDIA_ROOT}/<folder>/<filename>
 *   served as static files from ${MEDIA_PUBLIC_URL}/<folder>/<filename>
 *
 * Why not the `local` driver with a different path: on Hostinger, a Node app's
 * own folders (`domains/<api domain>/hbuilds`, its `public_html`) are replaced
 * on every deployment, which would wipe every upload. MEDIA_ROOT must be the web
 * root of a *separate, plain* (non-Node) site, e.g.
 * `/home/u123456789/domains/media.satoys.store/public_html`, which deployments
 * never touch. `init()` refuses a root inside the running app for that reason.
 *
 * If the Node process turns out not to be allowed to write there, use
 * `hostinger-http` instead — same folders, written by the PHP receiver.
 */

const FOLDERS_ALLOWED = new Set(['products', 'categories', 'brands', 'collections', 'banners', 'misc']);

let root = null;

function init() {
  if (root) return root;

  const { root: configured, publicUrl } = media;
  const missing = [!configured && 'MEDIA_ROOT', !publicUrl && 'MEDIA_PUBLIC_URL'].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `Hostinger storage is selected but not configured. Set ${missing.join(', ')} ` +
        '(see hostinger/media/README.md).',
    );
  }

  if (!path.isAbsolute(configured)) {
    throw new Error(`MEDIA_ROOT must be an absolute path, got "${configured}"`);
  }
  const resolved = path.resolve(configured);

  // The trap this driver exists to avoid: a root inside the deployed app is
  // deleted on the next deploy, taking every product photo with it.
  const app = path.resolve(process.cwd());
  const insideApp = resolved === app || resolved.startsWith(app + path.sep);
  if (insideApp || resolved.split(path.sep).includes('hbuilds')) {
    throw new Error(
      `MEDIA_ROOT (${resolved}) is inside the deployed app, which Hostinger replaces on every ` +
        'deployment. Point it at the public_html of a separate, non-Node site such as media.satoys.store.',
    );
  }

  try {
    fsSync.accessSync(resolved, fsSync.constants.W_OK);
  } catch (error) {
    throw new Error(
      `MEDIA_ROOT (${resolved}) is not writable by this process (${error.code}). ` +
        'Check the path in File Manager, or use STORAGE_DRIVER=hostinger-http.',
    );
  }

  try {
    new URL(publicUrl);
  } catch {
    throw new Error(`MEDIA_PUBLIC_URL is not a valid URL: ${publicUrl}`);
  }

  root = resolved;
  logger.info('Hostinger storage ready', { root, publicUrl });
  return root;
}

/**
 * The folder and filename both come from request parameters, so each is
 * checked rather than trusted: a known folder, a bare name (no separators, no
 * leading dot), and a final resolved path that is still inside the root.
 */
function targetFor(folder, filename) {
  const base = init();
  const invalid = () => {
    const error = new Error('Invalid path');
    error.code = 'EINVALIDPATH';
    return error;
  };

  if (!FOLDERS_ALLOWED.has(folder)) throw invalid();
  if (!filename || filename !== path.basename(filename) || filename.startsWith('.')) throw invalid();

  const target = path.resolve(base, folder, filename);
  if (!target.startsWith(path.join(base, folder) + path.sep)) throw invalid();
  return target;
}

const keyFor = (folder, filename) => `${folder}/${filename}`;
const urlFor = (key) => `${media.publicUrl}/${key}`;

async function save({ folder, filename, buffer }) {
  const target = targetFor(folder, filename);
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true, mode: 0o755 });

  // Written under a dotfile name, then renamed: the web server can never serve
  // a half-written file (the media .htaccess denies dotfiles), and the rename
  // is atomic within one filesystem.
  const temp = path.join(dir, `.tmp-${crypto.randomBytes(8).toString('hex')}`);
  await fs.writeFile(temp, buffer, { mode: 0o644, flag: 'wx' });

  try {
    // Names are unique per upload, so an existing file is a bug, not a
    // replacement — refuse rather than silently overwrite a live image.
    if (fsSync.existsSync(target)) {
      const error = new Error('A file with that name already exists');
      error.status = 409;
      throw error;
    }
    await fs.rename(temp, target);
  } catch (error) {
    await fs.unlink(temp).catch(() => {});
    throw error;
  }

  const key = keyFor(folder, filename);
  return { url: urlFor(key), key };
}

async function remove({ folder, filename }) {
  await fs.unlink(targetFor(folder, filename));
}

async function list(folder) {
  if (!FOLDERS_ALLOWED.has(folder)) return [];
  const dir = path.join(init(), folder);

  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  return Promise.all(
    names
      .filter((name) => !name.startsWith('.'))
      .map(async (name) => {
        const stat = await fs.stat(path.join(dir, name));
        const key = keyFor(folder, name);
        return {
          url: urlFor(key),
          key,
          filename: name,
          size: stat.size,
          uploadedAt: stat.mtime.toISOString(),
        };
      }),
  );
}

module.exports = { name: 'hostinger', save, remove, list, init };
