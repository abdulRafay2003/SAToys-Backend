const MAX_LIMIT = 100;

/** Parse `?page=&limit=` defensively — a client can send anything. */
function parsePagination(query, defaultLimit = 24) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const raw = Number.parseInt(query.limit, 10) || defaultLimit;
  const limit = Math.min(MAX_LIMIT, Math.max(1, raw));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Run a filter as a counted page. Kept separate from the controllers so every
 * list endpoint reports `meta` identically.
 */
async function paginate(Model, filter, { page, limit, skip }, { sort, select, populate, lean = true } = {}) {
  let q = Model.find(filter).skip(skip).limit(limit);
  if (sort) q = q.sort(sort);
  if (select) q = q.select(select);
  if (populate) q = q.populate(populate);
  if (lean) q = q.lean({ virtuals: true });

  const [items, total] = await Promise.all([q.exec(), Model.countDocuments(filter)]);

  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** `?category=a,b` and `?category=a&category=b` both mean the same thing. */
function toArray(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const list = Array.isArray(value) ? value : String(value).split(',');
  const out = list.map((s) => String(s).trim()).filter(Boolean);
  return out.length ? out : undefined;
}

const toInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
};

const toBool = (value) =>
  value === undefined ? undefined : value === 'true' || value === true || value === '1';

/**
 * Escape a user string before it becomes a RegExp. Without this, a search for
 * "(" is a crash and ".*" is a full collection scan.
 */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { parsePagination, paginate, toArray, toInt, toBool, escapeRegex, MAX_LIMIT };
