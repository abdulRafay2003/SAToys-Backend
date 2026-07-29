const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { publicUrl } = require('../../config/env');

/**
 * Local disk storage.
 *
 * The default driver, and the one that needs no credentials — useful for
 * development and for anyone self-hosting on a box with a persistent volume.
 *
 * It is *not* suitable for ephemeral hosting (Render, Railway, Fly, Heroku,
 * most container platforms): the filesystem is wiped on every deploy, so
 * uploaded images would disappear. Use the Firebase driver there.
 */

const ROOT = path.join(__dirname, '..', '..', '..', 'uploads');

/** Where the object lives, relative to the bucket/root. */
const keyFor = (folder, filename) => `${folder}/${filename}`;

async function save({ folder, filename, buffer }) {
  const dir = path.join(ROOT, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);

  return {
    url: `${publicUrl}/uploads/${keyFor(folder, filename)}`,
    key: keyFor(folder, filename),
  };
}

async function remove({ folder, filename }) {
  const target = path.resolve(ROOT, folder, path.basename(filename));

  // A filename of "../../.env" resolves outside the root and is refused.
  if (!target.startsWith(path.resolve(ROOT) + path.sep)) {
    const error = new Error('Invalid path');
    error.code = 'EINVALIDPATH';
    throw error;
  }

  await fs.unlink(target);
}

async function list(folder) {
  const dir = path.join(ROOT, folder);

  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }

  const files = await Promise.all(
    names
      .filter((n) => !n.startsWith('.'))
      .map(async (name) => {
        const stat = await fs.stat(path.join(dir, name));
        return {
          url: `${publicUrl}/uploads/${keyFor(folder, name)}`,
          key: keyFor(folder, name),
          filename: name,
          size: stat.size,
          uploadedAt: stat.mtime.toISOString(),
        };
      }),
  );

  return files;
}

/** Ensures the tree exists at boot so the static handler has something to serve. */
function init() {
  fsSync.mkdirSync(ROOT, { recursive: true });
}

module.exports = { name: 'local', save, remove, list, init, ROOT };
