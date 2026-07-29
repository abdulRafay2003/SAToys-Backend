const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { FAQ_GROUPS } = require('../config/constants');

/** Backs `Faq` in the storefront Zod. `group` drives the accordion sections. */
const FaqSchema = new mongoose.Schema(
  {
    question: { type: String, trim: true, required: true, maxlength: 300 },
    answer: { type: String, trim: true, required: true },
    group: { type: String, enum: FAQ_GROUPS, required: true, index: true },
    sortOrder: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

serialise(FaqSchema);
FaqSchema.index({ isPublished: 1, group: 1, sortOrder: 1 });

module.exports = mongoose.model('Faq', FaqSchema);
