const path = require('path');
const fs = require('fs/promises');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, noContent } = require('../utils/respond');
const { ROOT, FOLDERS, folderFor } = require('../middleware/upload');
const { publicUrl } = require('../config/env');
const logger = require('../utils/logger');

/** Stored files are served from /uploads, so the public URL is derivable. */
const describe = (file, folder) => ({
  url: `${publicUrl}/uploads/${folder}/${file.filename}`,
  path: `${folder}/${file.filename}`,
  filename: file.filename,
  originalName: file.originalname,
  size: file.size,
  mimeType: file.mimetype,
});

const uploadOne = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No file was uploaded');
  return created(res, describe(req.file, folderFor(req)));
});

const uploadMany = asyncHandler(async (req, res) => {
  if (!req.files?.length) throw ApiError.badRequest('No files were uploaded');
  const folder = folderFor(req);
  return created(res, req.files.map((f) => describe(f, folder)));
});

/**
 * DELETE /admin/uploads/:folder/:filename
 *
 * The path is rebuilt from a whitelisted folder plus a basename, then checked to
 * be inside the uploads root — a filename of "../../.env" resolves outside it
 * and is refused.
 */
const remove = asyncHandler(async (req, res) => {
  const { folder, filename } = req.params;

  if (!FOLDERS.includes(folder)) throw ApiError.badRequest('Unknown upload folder');

  const target = path.resolve(ROOT, folder, path.basename(filename));
  if (!target.startsWith(path.resolve(ROOT) + path.sep)) {
    throw ApiError.badRequest('Invalid path');
  }

  try {
    await fs.unlink(target);
  } catch (error) {
    if (error.code === 'ENOENT') throw ApiError.notFound('File');
    throw error;
  }

  logger.info('Upload deleted', { folder, filename });
  return noContent(res);
});

/** GET /admin/uploads/:folder — a simple media library listing. */
const list = asyncHandler(async (req, res) => {
  const folder = req.params.folder;
  if (!FOLDERS.includes(folder)) throw ApiError.badRequest('Unknown upload folder');

  const dir = path.join(ROOT, folder);
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const files = await Promise.all(
    names
      .filter((n) => !n.startsWith('.'))
      .map(async (name) => {
        const stat = await fs.stat(path.join(dir, name));
        return {
          url: `${publicUrl}/uploads/${folder}/${name}`,
          path: `${folder}/${name}`,
          filename: name,
          size: stat.size,
          uploadedAt: stat.mtime.toISOString(),
        };
      }),
  );

  files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return ok(res, files);
});

module.exports = { uploadOne, uploadMany, remove, list };
