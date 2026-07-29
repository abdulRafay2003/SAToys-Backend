const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { upload: uploadConfig } = require('../config/env');
const storage = require('../services/storage');

/**
 * Multipart parsing only — the bytes are held in memory and handed to the
 * storage service, which decides where they actually go.
 *
 * Memory rather than disk because the Firebase driver needs a buffer, and
 * writing to disk first only to re-read and upload would be a pointless round
 * trip. The file-size limit below is what keeps memory bounded: at the default
 * 5MB x 12 files, a single request tops out at 60MB.
 */

const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
]);

const fileFilter = (req, file, cb) => {
  if (!ALLOWED.has(file.mimetype)) {
    return cb(ApiError.badRequest(`${file.mimetype} is not an accepted image type`));
  }
  cb(null, true);
};

const uploader = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: uploadConfig.maxFileSizeMb * 1024 * 1024,
    files: uploadConfig.maxFiles,
  },
});

const single = uploader.single('file');
const many = uploader.array('files', uploadConfig.maxFiles);

module.exports = {
  single,
  many,
  FOLDERS: storage.FOLDERS,
  folderFor: storage.folderFor,
};
