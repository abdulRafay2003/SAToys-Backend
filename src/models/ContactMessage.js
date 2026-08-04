const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');

/** A submission from the storefront's contact form. Write-only from the public side. */
const ContactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, required: true, maxlength: 200 },
    subject: { type: String, trim: true, default: '', maxlength: 200 },
    message: { type: String, trim: true, required: true, maxlength: 5000 },
    status: { type: String, enum: ['new', 'read', 'archived'], default: 'new', index: true },
  },
  { timestamps: true },
);

serialise(ContactMessageSchema);
ContactMessageSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ContactMessage', ContactMessageSchema);
