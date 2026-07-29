const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { isProd } = require('../config/env');

/**
 * Terminal error handler. Translates the error vocabularies we actually
 * encounter — Mongoose, Multer, JWT, Zod — into the single envelope from
 * DOMAIN.md, and refuses to leak anything it does not recognise.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  if (!(error instanceof ApiError)) {
    error = translate(err);
  }

  const payload = {
    success: false,
    error: {
      message: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    },
  };

  if (error.statusCode >= 500) {
    logger.error(err.message, { path: req.originalUrl, method: req.method, stack: err.stack });
    if (!isProd) payload.error.stack = err.stack;
  } else {
    logger.debug(`${error.statusCode} ${req.method} ${req.originalUrl}`, {
      message: error.message,
    });
  }

  res.status(error.statusCode || 500).json(payload);
}

function translate(err) {
  // Mongoose: malformed ObjectId in a path parameter.
  if (err.name === 'CastError') {
    return new ApiError(400, `Invalid value for '${err.path}'`, { code: 'INVALID_ID' });
  }

  // Mongoose: schema validation.
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return ApiError.validation('Validation failed', details);
  }

  // Mongo: unique index violation. Name the field — "duplicate key" alone is useless in a form.
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return ApiError.conflict(`That ${field} is already taken`, [
      { field, message: 'Must be unique' },
    ]);
  }

  if (err.name === 'JsonWebTokenError') return ApiError.unauthenticated('Invalid token');
  if (err.name === 'TokenExpiredError') return ApiError.unauthenticated('Session expired');

  // Multer.
  if (err.code === 'LIMIT_FILE_SIZE') {
    return ApiError.badRequest('File is too large');
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return ApiError.badRequest('Too many files');
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return ApiError.badRequest(`Unexpected file field '${err.field}'`);
  }

  // Anything else is a bug: report it, describe nothing.
  return new ApiError(500, isProd ? 'Something went wrong' : err.message || 'Server error');
}

module.exports = errorHandler;
