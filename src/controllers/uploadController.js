const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, noContent } = require('../utils/respond');
const storage = require('../services/storage');
const logger = require('../utils/logger');

/**
 * Uploads.
 *
 * The controller knows nothing about where files land — it hands buffers to the
 * storage service and returns whatever URL comes back. Switching between local
 * disk and Firebase is an environment variable, not a code change.
 */

async function store(file, folder) {
  const filename = storage.safeFilename(file.originalname);

  const { url, key } = await storage.save({
    folder,
    filename,
    buffer: file.buffer,
    mimeType: file.mimetype,
  });

  return {
    url,
    path: key,
    filename,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
  };
}

const uploadOne = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No file was uploaded');

  const folder = storage.folderFor(req);
  const result = await store(req.file, folder);

  logger.info('Upload stored', { driver: storage.name, key: result.path });
  return created(res, result);
});

const uploadMany = asyncHandler(async (req, res) => {
  if (!req.files?.length) throw ApiError.badRequest('No files were uploaded');

  const folder = storage.folderFor(req);
  // Uploaded in parallel; one slow file should not hold up the rest.
  const results = await Promise.all(req.files.map((f) => store(f, folder)));

  logger.info('Uploads stored', { driver: storage.name, count: results.length });
  return created(res, results);
});

/** DELETE /admin/uploads/:folder/:filename */
const remove = asyncHandler(async (req, res) => {
  const { folder, filename } = req.params;
  if (!storage.FOLDERS.includes(folder)) throw ApiError.badRequest('Unknown upload folder');

  try {
    await storage.remove({ folder, filename });
  } catch (error) {
    if (error.code === 'ENOENT') throw ApiError.notFound('File');
    if (error.code === 'EINVALIDPATH') throw ApiError.badRequest('Invalid path');
    throw error;
  }

  logger.info('Upload deleted', { driver: storage.name, folder, filename });
  return noContent(res);
});

/** GET /admin/uploads/:folder — a simple media library listing, newest first. */
const list = asyncHandler(async (req, res) => {
  const folder = req.params.folder;
  if (!storage.FOLDERS.includes(folder)) throw ApiError.badRequest('Unknown upload folder');

  const files = await storage.list(folder);
  files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  return ok(res, files);
});

module.exports = { uploadOne, uploadMany, remove, list };
