const slugify = require('slugify');

const toSlug = (value) =>
  slugify(String(value || ''), { lower: true, strict: true, trim: true });

/**
 * Slugs are unique per collection. Rather than bouncing a 409 back at the admin
 * for something we can resolve, append the smallest numeric suffix that frees it.
 *
 * @param {import('mongoose').Model} Model
 * @param {string} base - already slugified
 * @param {string} [excludeId] - the document being updated, so it doesn't collide with itself
 */
async function uniqueSlug(Model, base, excludeId) {
  const root = toSlug(base) || 'item';
  let candidate = root;
  let n = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = { slug: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    const clash = await Model.exists(query);
    if (!clash) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
}

module.exports = { toSlug, uniqueSlug };
