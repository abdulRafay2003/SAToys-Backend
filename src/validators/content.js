const { z, objectId, money, slug, tone, seo } = require('./common');
const C = require('../config/constants');

const createPost = z.object({
  title: z.string().trim().min(1).max(160),
  slug: slug.optional(),
  excerpt: z.string().trim().max(300).optional(),
  body: z.array(z.string().trim().min(1)).min(1, 'A post needs at least one paragraph'),
  author: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(60).optional(),
  tone: tone.optional(),
  coverImage: z.string().trim().nullable().optional(),
  isPublished: z.boolean().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  seo,
});

const createFaq = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1),
  group: z.enum(C.FAQ_GROUPS),
  sortOrder: z.number().int().optional(),
  isPublished: z.boolean().optional(),
});

const createTestimonial = z.object({
  quote: z.string().trim().min(1).max(500),
  author: z.string().trim().min(1).max(80),
  role: z.string().trim().max(120).optional(),
  avatar: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isPublished: z.boolean().optional(),
});

/** Kept as a plain shape so both create and update can be derived from it. */
const bannerShape = {
  placement: z.enum(C.BANNER_PLACEMENTS),
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300).optional(),
  image: z.string().trim().nullable().optional(),
  video: z.string().trim().nullable().optional(),
  href: z.string().trim().nullable().optional(),
  ctaLabel: z.string().trim().max(60).nullable().optional(),
  tone: tone.optional(),
  category: objectId.nullable().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  sortOrder: z.number().int().optional(),
};

const orderedDates = (v) => !v.startsAt || !v.endsAt || v.startsAt <= v.endsAt;
const dateOrderMessage = {
  message: 'The start date must be before the end date',
  path: ['endsAt'],
};

const createBanner = z.object(bannerShape).refine(orderedDates, dateOrderMessage);
const updateBanner = z.object(bannerShape).partial().refine(orderedDates, dateOrderMessage);

const createHomeSection = z.object({
  type: z.enum(C.HOME_SECTION_TYPES),
  name: z.string().trim().min(1).max(120),
  heading: z.string().trim().max(300).optional(),
  subheading: z.string().trim().max(500).optional(),
  body: z.string().trim().max(5000).optional(),
  image: z.string().trim().nullable().optional(),
  tone: tone.optional(),
  ctaLabel: z.string().trim().max(60).nullable().optional(),
  ctaHref: z.string().trim().nullable().optional(),
  secondaryCtaLabel: z.string().trim().max(60).nullable().optional(),
  secondaryCtaHref: z.string().trim().nullable().optional(),
  config: z
    .object({
      source: z.enum(C.RAIL_SOURCES).optional(),
      products: z.array(objectId).optional(),
      collections: z.array(objectId).optional(),
      limit: z.number().int().min(1).max(24).optional(),
      showCanvas: z.boolean().optional(),
    })
    .optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const navLink = z.object({
  label: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1),
  note: z.string().trim().max(120).nullable().optional(),
  category: objectId.nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const updateNav = z.object({
  columns: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(80),
        tone: tone.optional(),
        links: z.array(navLink).optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .optional(),
  links: z.array(navLink).optional(),
});

const updateSettings = z.object({
  site: z
    .object({
      name: z.string().trim().max(80).optional(),
      tagline: z.string().trim().max(200).optional(),
      logo: z.string().trim().nullable().optional(),
      favicon: z.string().trim().nullable().optional(),
    })
    .optional(),
  contact: z
    .object({
      email: z.email('Must be a valid email').or(z.literal('')).optional(),
      phone: z.string().trim().max(40).optional(),
      addressLines: z.array(z.string().trim()).optional(),
      openingHours: z.string().trim().max(200).optional(),
    })
    .optional(),
  social: z
    .array(
      z.object({
        platform: z.string().trim().min(1),
        url: z.url('Must be a valid URL'),
        icon: z.string().trim().nullable().optional(),
      }),
    )
    .optional(),
  footer: z
    .object({
      blurb: z.string().trim().max(500).optional(),
      copyright: z.string().trim().max(200).optional(),
      newsletterHeading: z.string().trim().max(120).optional(),
      newsletterBlurb: z.string().trim().max(300).optional(),
    })
    .optional(),
  seo: z
    .object({
      defaultTitle: z.string().trim().max(70).optional(),
      titleTemplate: z.string().trim().max(70).optional(),
      defaultDescription: z.string().trim().max(200).optional(),
      ogImage: z.string().trim().nullable().optional(),
      robots: z.string().trim().max(80).optional(),
    })
    .optional(),
  commerce: z
    .object({
      currency: z.string().trim().length(3).optional(),
      currencySymbol: z.string().trim().max(4).optional(),
      freeShippingThreshold: money.optional(),
      taxRateBps: z.number().int().min(0).max(10000).optional(),
      pricesIncludeTax: z.boolean().optional(),
    })
    .optional(),
});

module.exports = {
  createPost,
  updatePost: createPost.partial(),
  createFaq,
  updateFaq: createFaq.partial(),
  createTestimonial,
  updateTestimonial: createTestimonial.partial(),
  createBanner,
  updateBanner,
  createHomeSection,
  updateHomeSection: createHomeSection.partial(),
  updateNav,
  updateSettings,
};
