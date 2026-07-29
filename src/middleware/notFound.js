const ApiError = require('../utils/ApiError');

/** Unmatched route → the same error envelope as everything else, not Express's HTML page. */
const notFound = (req, res, next) =>
  next(new ApiError(404, `No route for ${req.method} ${req.originalUrl}`, { code: 'NO_ROUTE' }));

module.exports = notFound;
