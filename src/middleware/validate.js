const ApiError = require('../utils/ApiError');

/**
 * Zod request validation.
 *
 * Zod (rather than express-validator, which the old project used) is deliberate:
 * the storefront already declares this domain in Zod, so these schemas can be
 * near-copies of `Toys-Website/src/data/schemas/index.ts`. One vocabulary across
 * two codebases means a rule cannot be tightened on one side only.
 *
 * The parsed result *replaces* the raw input, so controllers receive coerced,
 * stripped values and never re-check a type.
 */
const validate = (schemas) => (req, res, next) => {
  for (const key of ['body', 'query', 'params']) {
    const schema = schemas[key];
    if (!schema) continue;

    const result = schema.safeParse(req[key]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || key,
        message: issue.message,
      }));
      return next(ApiError.validation(`Invalid request ${key}`, details));
    }

    // Express 5 makes req.query a getter — assigning to it throws. Stash the
    // parsed value on a parallel property the controllers read instead.
    if (key === 'query') {
      req.validatedQuery = result.data;
    } else {
      req[key] = result.data;
    }
  }

  return next();
};

module.exports = validate;
