const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { SeoSchema, AgeRangeSchema } = require('./shared');
const { TONES, CATEGORY_KINDS } = require('../config/constants');

/**
 * Backs `Category` in the storefront Zod, plus the parent/child nesting the
 * admin panel needs.
 *
 * `kind` is retained separately from `parent`: it groups the mega-menu into
 * "By age / By type / By interest" columns, which is a different axis from
 * hierarchy. A child of "Wooden" is still `kind: "type"`.
 */
const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, maxlength: 80 },
    slug: { type: String, trim: true, lowercase: true, required: true, unique: true, index: true },
    kind: { type: String, enum: CATEGORY_KINDS, required: true, index: true },
    blurb: { type: String, trim: true, default: '', maxlength: 300 },
    tone: { type: String, enum: TONES, default: 'coral' },

    /** Only meaningful when kind === "age". Drives the age filter bands. */
    ageRange: { type: AgeRangeSchema, default: null },

    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },

    image: { type: String, trim: true, default: null },
    /** Lucide icon name, matching the storefront's icon set. */
    icon: { type: String, trim: true, default: null },

    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

serialise(CategorySchema);

CategorySchema.index({ isActive: 1, sortOrder: 1 });

/**
 * Two rules, both of which would otherwise surface as an infinite loop when the
 * storefront walks the tree: a category cannot be its own parent, and the tree
 * is capped at two levels (parent → child) as DOMAIN.md specifies.
 */
// Async hook: throw to reject, return to continue. Mongoose does not supply
// `next` to async middleware.
CategorySchema.pre('save', async function preSave() {
  if (!this.parent) return;

  if (String(this.parent) === String(this._id)) {
    throw new Error('A category cannot be its own parent');
  }

  const parent = await this.constructor.findById(this.parent).select('parent').lean();
  if (!parent) throw new Error('Parent category does not exist');
  if (parent.parent) throw new Error('Categories nest two levels deep at most');
});

CategorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent',
});

module.exports = mongoose.model('Category', CategorySchema);
