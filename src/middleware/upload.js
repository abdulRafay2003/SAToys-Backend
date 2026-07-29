const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { upload: uploadConfig } = require('../config/env');

/**
 * Local disk storage. Swapping to S3/R2 later means replacing this storage
 * engine and `publicUrlFor` — nothing else, because the rest of the codebase
 * only ever sees the returned URL string.
 */

const ROOT = path.join(__dirname, '..', '..', 'uploads');

/** Restricted to the folders that exist, so a crafted field cannot escape the tree. */
const FOLDERS = ['products', 'categories', 'brands', 'collections', 'banners', 'misc'];

const folderFor = (req) => {
  const requested = String(req.params.folder || req.body.folder || 'misc');
  return FOLDERS.includes(requested) ? requested : 'misc';
};

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(ROOT, folderFor(req));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    // Never trust the client's filename — it can contain path separators, and
    // two uploads called "image.jpg" must not collide.
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : '';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`);
  },
});

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml']);

const fileFilter = (req, file, cb) => {
  if (!ALLOWED.has(file.mimetype)) {
    return cb(ApiError.badRequest(`${file.mimetype} is not an accepted image type`));
  }
  cb(null, true);
};

const uploader = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: uploadConfig.maxFileSizeMb * 1024 * 1024,
    files: uploadConfig.maxFiles,
  },
});

const single = uploader.single('file');
const many = uploader.array('files', uploadConfig.maxFiles);

module.exports = { single, many, ROOT, FOLDERS, folderFor };
