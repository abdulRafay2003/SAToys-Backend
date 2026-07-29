const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { SeoSchema } = require('./shared');
const { TONES } = require('../config/constants');

/**
 * Backs `BlogPost` in the storefront Zod. `body` stays an array of paragraphs
 * rather than a markdown blob — the storefront renders each as its own <p> and
 * staggers them on reveal.
 */
const BlogPostSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true, maxlength: 160 },
    slug: { type: String, trim: true, lowercase: true, required: true, unique: true, index: true },
    excerpt: { type: String, trim: true, default: '', maxlength: 300 },
    body: [{ type: String, trim: true }],

    author: { type: String, trim: true, required: true },
    topic: { type: String, trim: true, default: 'General', index: true },
    tone: { type: String, enum: TONES, default: 'sky' },
    coverImage: { type: String, trim: true, default: null },

    publishedAt: { type: Date, default: null, index: true },
    isPublished: { type: Boolean, default: false, index: true },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

serialise(BlogPostSchema);
BlogPostSchema.index({ isPublished: 1, publishedAt: -1 });

/**
 * Reading time is derived, not authored — an editor who tweaks a paragraph
 * should not have to remember to update a number.
 */
BlogPostSchema.virtual('readingMinutes').get(function readingMinutes() {
  const words = (this.body || []).join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
});

BlogPostSchema.pre('save', function preSave() {
  if (this.isPublished && !this.publishedAt) this.publishedAt = new Date();
});

module.exports = mongoose.model('BlogPost', BlogPostSchema);
