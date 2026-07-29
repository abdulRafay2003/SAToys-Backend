const crypto = require('crypto');
const path = require('path');
const { storageDriver } = require('../../config/env');

/**
 * Storage abstraction.
 *
 * Every driver exposes the same four functions and, crucially, `save` returns a
 * `{ url, key }` — the rest of the codebase only ever sees that URL string, so
 * switching drivers changes nothing outside this folder. Products already
 * store an image URL, not a path.
 */

const drivers = {
  local: require('./local'),
  firebase: require('./firebase'),
};

const driver = drivers[storageDriver] || drivers.local;

/** Folders an upload may target, so a crafted field cannot write anywhere else. */
const FOLDERS = ['products', 'categories', 'brands', 'collections', 'banners', 'misc'];

const folderFor = (req) => {
  const requested = String(req.params.folder || req.body.folder || 'misc');
  return FOLDERS.includes(requested) ? requested : 'misc';
};

/**
 * A safe, collision-free object name.
 *
 * The client's filename is never trusted: it can contain path separators, and
 * two people uploading "image.jpg" must not overwrite each other.
 */
function safeFilename(originalName) {
  const ext = path.extname(originalName || '').toLowerCase().slice(0, 10);
  const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : '';
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`;
}

module.exports = {
  driver,
  name: driver.name,
  FOLDERS,
  folderFor,
  safeFilename,
  save: (args) => driver.save(args),
  remove: (args) => driver.remove(args),
  list: (folder) => driver.list(folder),
  init: () => (driver.init ? driver.init() : undefined),
};
