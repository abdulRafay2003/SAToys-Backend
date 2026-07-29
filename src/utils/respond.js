/**
 * One response shape for the whole API, so both clients can write a single
 * unwrapping helper instead of special-casing per endpoint. See DOMAIN.md.
 */

const ok = (res, data, extra = {}) => res.status(200).json({ success: true, data, ...extra });

const created = (res, data) => res.status(201).json({ success: true, data });

const noContent = (res) => res.status(204).end();

/**
 * @param {object} page - result of paginate(), i.e. { items, total, page, pages, limit }
 * @param {object} [extra] - merged into the envelope (facets ride here)
 */
const paginated = (res, page, extra = {}) =>
  res.status(200).json({
    success: true,
    data: page.items,
    meta: {
      total: page.total,
      page: page.page,
      pages: page.pages,
      limit: page.limit,
    },
    ...extra,
  });

module.exports = { ok, created, noContent, paginated };
