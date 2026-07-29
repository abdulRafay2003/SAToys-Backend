/**
 * Operational errors — ones we threw deliberately and can describe to a client.
 * Anything that is *not* an ApiError reaching the error handler is a bug, and
 * is reported as a generic 500 without leaking internals.
 */
class ApiError extends Error {
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || ApiError.defaultCode(statusCode);
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static defaultCode(statusCode) {
    return (
      {
        400: 'BAD_REQUEST',
        401: 'UNAUTHENTICATED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        422: 'VALIDATION_ERROR',
        429: 'RATE_LIMITED',
      }[statusCode] || 'INTERNAL_ERROR'
    );
  }

  static badRequest(message, details) {
    return new ApiError(400, message, { details });
  }
  static unauthenticated(message = 'Authentication required') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'You do not have permission to do that') {
    return new ApiError(403, message);
  }
  static notFound(resource = 'Resource') {
    return new ApiError(404, `${resource} not found`);
  }
  static conflict(message, details) {
    return new ApiError(409, message, { details });
  }
  static validation(message = 'Validation failed', details) {
    return new ApiError(422, message, { code: 'VALIDATION_ERROR', details });
  }
}

module.exports = ApiError;
