const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok, created, noContent, paginated } = require('../utils/respond');
const { parsePagination, paginate, escapeRegex } = require('../utils/query');
const { toSlug, uniqueSlug } = require('../utils/slug');

/**
 * Admin CRUD is the same nine lines for most resources: list with search and
 * paging, read one, create, update, delete, reorder. Writing that fifteen times
 * guarantees the fifteenth copy drifts.
 *
 * Anything genuinely resource-specific (products, orders, reviews) overrides a
 * handler or skips the factory entirely rather than growing an options bag.
 *
 * @param {object}   opts
 * @param {Model}    opts.Model
 * @param {string}   opts.name          - human label used in error messages
 * @param {string[]} [opts.searchFields]- fields the `?q=` filter matches against
 * @param {Function} [opts.serialise]   - document → API shape
 * @param {string}   [opts.slugFrom]    - field to derive a slug from
 * @param {object}   [opts.sort]        - default sort
 * @param {string[]} [opts.populate]
 * @param {Function} [opts.beforeDelete]- throw to block a delete (referential guard)
 */
function crudFactory({
  Model,
  name,
  searchFields = ['name'],
  serialise = (d) => d,
  slugFrom = null,
  sort = { sortOrder: 1, createdAt: -1 },
  populate = null,
  beforeDelete = null,
}) {
  const findOr404 = async (id) => {
    let doc = await Model.findById(id);
    if (!doc) throw ApiError.notFound(name);
    if (populate) doc = await doc.populate(populate);
    return doc;
  };

  /** Slug is derived on create and only re-derived when explicitly supplied. */
  const ensureSlug = async (body, doc = null) => {
    if (!slugFrom) return;
    const wants = body.slug || (doc ? null : body[slugFrom]);
    if (!wants) return;
    body.slug = await uniqueSlug(Model, toSlug(wants), doc?._id);
  };

  const list = asyncHandler(async (req, res) => {
    const q = req.validatedQuery || req.query;
    const { page, limit, skip } = parsePagination(q, 25);

    const filter = {};
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = searchFields.map((f) => ({ [f]: rx }));
    }
    if (q.isActive !== undefined) filter.isActive = q.isActive;
    if (q.status) filter.status = q.status;

    const result = await paginate(Model, filter, { page, limit, skip }, { sort, populate });
    return paginated(res, { ...result, items: result.items.map(serialise) });
  });

  const getOne = asyncHandler(async (req, res) => {
    const doc = await findOr404(req.params.id);
    return ok(res, serialise(doc));
  });

  const create = asyncHandler(async (req, res) => {
    await ensureSlug(req.body);
    const doc = await Model.create(req.body);
    if (populate) await doc.populate(populate);
    return created(res, serialise(doc));
  });

  const update = asyncHandler(async (req, res) => {
    const doc = await findOr404(req.params.id);
    await ensureSlug(req.body, doc);

    // Assign then save, rather than findByIdAndUpdate, so pre-save hooks and
    // schema validators actually run — several models derive state there.
    Object.assign(doc, req.body);
    await doc.save();
    if (populate) await doc.populate(populate);
    return ok(res, serialise(doc));
  });

  const remove = asyncHandler(async (req, res) => {
    const doc = await findOr404(req.params.id);
    if (beforeDelete) await beforeDelete(doc);
    await doc.deleteOne();
    return noContent(res);
  });

  /** Drag-to-reorder in the admin list views. One write per row, in a batch. */
  const reorder = asyncHandler(async (req, res) => {
    const ops = req.body.items.map(({ id, sortOrder }) => ({
      updateOne: { filter: { _id: id }, update: { $set: { sortOrder } } },
    }));
    await Model.bulkWrite(ops);
    return ok(res, { updated: ops.length });
  });

  return { list, getOne, create, update, remove, reorder, findOr404 };
}

module.exports = crudFactory;
