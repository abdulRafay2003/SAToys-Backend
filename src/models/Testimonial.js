const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');

/** Backs `Testimonial` in the storefront Zod. Distinct from Review: editorial, not user-submitted. */
const TestimonialSchema = new mongoose.Schema(
  {
    quote: { type: String, trim: true, required: true, maxlength: 500 },
    author: { type: String, trim: true, required: true, maxlength: 80 },
    /** "Two children, 4 and 7" — context rather than a job title. */
    role: { type: String, trim: true, default: '', maxlength: 120 },
    avatar: { type: String, trim: true, default: null },
    sortOrder: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

serialise(TestimonialSchema);
TestimonialSchema.index({ isPublished: 1, sortOrder: 1 });

module.exports = mongoose.model('Testimonial', TestimonialSchema);
