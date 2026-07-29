/**
 * Express 5 forwards rejected promises to the error handler on its own, but
 * only for handlers it can see are async. Wrapping keeps the behaviour explicit
 * and identical across middleware, controllers and route-level guards.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
