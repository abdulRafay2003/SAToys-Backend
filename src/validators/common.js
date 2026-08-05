const { z } = require('zod');
const C = require('../config/constants');

/**
 * Shared Zod pieces. These deliberately mirror
 * `Toys-Website/src/data/schemas/index.ts` — same rules, same vocabulary — so a
 * value the admin panel accepts is a value the storefront can parse.
 */

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');

/** Money: positive integer minor units. Rejects `19.99` outright. */
const money = z.number().int('Must be a whole number of pence').min(0);

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be lowercase words separated by hyphens');

const tone = z.enum(C.TONES);

const seo = z
  .object({
    title: z.string().trim().max(70).optional(),
    description: z.string().trim().max(200).optional(),
    keywords: z.array(z.string().trim()).optional(),
    ogImage: z.string().trim().nullable().optional(),
    noIndex: z.boolean().optional(),
  })
  .optional();

const image = z.object({
  url: z.string().trim().nullable().optional(),
  seed: z.string().trim().optional(),
  alt: z.string().trim().max(300).optional(),
  type: z.enum(C.IMAGE_TYPES).optional(),
  sortOrder: z.number().int().optional(),
});

const ageRange = z
  .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
  .refine((v) => v.max >= v.min, { message: 'max must be at least min' });

const address = z.object({
  label: z.string().trim().optional(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  line1: z.string().trim().min(1),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  county: z.string().trim().optional(),
  // Optional: plenty of Pakistani addresses are delivered on landmarks
  // rather than a postcode — the storefront's checkout form reflects this.
  postcode: z.string().trim().optional(),
  country: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  isDefault: z.boolean().optional(),
});

// --- Query-string coercion ---------------------------------------------------
// Everything arrives as a string. These turn "12" into 12 and "a,b" into
// ["a","b"] before a controller sees them.

const csv = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => {
    const list = Array.isArray(v) ? v : String(v).split(',');
    return list.map((s) => s.trim()).filter(Boolean);
  })
  .refine((v) => v.length > 0, { message: 'Must not be empty' })
  .optional();

const intParam = z.coerce.number().int().optional();
const numParam = z.coerce.number().optional();
const boolParam = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1')
  .optional();

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
};

/** The storefront's product query, verbatim. */
const productQuery = z.object({
  category: csv,
  brand: csv,
  collection: csv,
  min: intParam,
  max: intParam,
  rating: numParam,
  ageMin: intParam,
  ageMax: intParam,
  badge: csv,
  inStock: boolParam,
  featured: boolParam,
  trending: boolParam,
  newArrival: boolParam,
  bestSeller: boolParam,
  q: z.string().trim().min(1).max(120).optional(),
  sort: z.enum(Object.keys(C.PRODUCT_SORTS)).default('popular'),
  facets: boolParam,
  ...pagination,
});

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  sort: z.string().trim().optional(),
  status: z.string().trim().optional(),
  isActive: boolParam,
  ...pagination,
});

const slugParam = z.object({ slug: z.string().trim().min(1) });
const idParam = z.object({ id: objectId });

module.exports = {
  z,
  objectId,
  money,
  slug,
  tone,
  seo,
  image,
  ageRange,
  address,
  csv,
  intParam,
  numParam,
  boolParam,
  pagination,
  productQuery,
  listQuery,
  slugParam,
  idParam,
};
