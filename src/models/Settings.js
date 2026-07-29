const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { money } = require('./shared');

/**
 * Site-wide settings — a singleton.
 *
 * Enforced with a fixed `key` and a unique index rather than by convention, so
 * a second settings document is a database error rather than a subtle bug where
 * half the site reads one row and half reads another.
 */
const SettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true, immutable: true },

    site: {
      name: { type: String, trim: true, default: 'LUMO' },
      tagline: { type: String, trim: true, default: '' },
      logo: { type: String, trim: true, default: null },
      favicon: { type: String, trim: true, default: null },
    },

    contact: {
      email: { type: String, trim: true, lowercase: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      addressLines: [{ type: String, trim: true }],
      openingHours: { type: String, trim: true, default: '' },
    },

    social: [
      {
        _id: false,
        platform: { type: String, trim: true, required: true },
        url: { type: String, trim: true, required: true },
        /** Lucide icon name. */
        icon: { type: String, trim: true, default: null },
      },
    ],

    footer: {
      blurb: { type: String, trim: true, default: '' },
      copyright: { type: String, trim: true, default: '' },
      newsletterHeading: { type: String, trim: true, default: '' },
      newsletterBlurb: { type: String, trim: true, default: '' },
    },

    seo: {
      defaultTitle: { type: String, trim: true, default: '' },
      /** e.g. "%s · LUMO" */
      titleTemplate: { type: String, trim: true, default: '%s' },
      defaultDescription: { type: String, trim: true, default: '' },
      ogImage: { type: String, trim: true, default: null },
      robots: { type: String, trim: true, default: 'index,follow' },
    },

    commerce: {
      currency: { type: String, trim: true, uppercase: true, default: 'GBP' },
      currencySymbol: { type: String, trim: true, default: '£' },
      /** Was FREE_SHIPPING_THRESHOLD, a constant in the storefront. Minor units. */
      freeShippingThreshold: money({ default: 5000, min: 0 }),
      /** Basis points (2000 = 20%), so VAT never becomes a float. */
      taxRateBps: { type: Number, default: 0, min: 0, max: 10000 },
      pricesIncludeTax: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

serialise(SettingsSchema);

/** Always returns a document — creates the singleton on first call. */
SettingsSchema.statics.load = async function load() {
  const existing = await this.findOne({ key: 'default' });
  if (existing) return existing;
  return this.create({ key: 'default' });
};

module.exports = mongoose.model('Settings', SettingsSchema);
