const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { TONES, NAV_LOCATIONS } = require('../config/constants');

/**
 * Replaces `Toys-Website/src/data/config/nav.ts`.
 *
 * One document per location. The mega menu, the collections panel and the footer
 * all share the column/link shape, so they share a model rather than three
 * near-identical ones.
 */
const NavLinkSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true, maxlength: 80 },
    href: { type: String, trim: true, required: true },
    /** Short line shown in the mega panel and mobile sheet. */
    note: { type: String, trim: true, default: null, maxlength: 120 },
    /** Optional — a link may point at a category without hardcoding its slug. */
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true },
);

const NavColumnSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true, maxlength: 80 },
    tone: { type: String, enum: TONES, default: 'coral' },
    links: [NavLinkSchema],
    sortOrder: { type: Number, default: 0 },
  },
  { _id: true },
);

const NavMenuSchema = new mongoose.Schema(
  {
    location: {
      type: String,
      enum: NAV_LOCATIONS,
      required: true,
      unique: true,
      index: true,
    },
    columns: [NavColumnSchema],
    /** `primary` is a flat list; it uses this instead of columns. */
    links: [NavLinkSchema],
  },
  { timestamps: true },
);

serialise(NavMenuSchema);

module.exports = mongoose.model('NavMenu', NavMenuSchema);
