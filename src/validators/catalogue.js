const { z, objectId, money, slug, tone, seo, image, ageRange } = require('./common');
const C = require('../config/constants');

/**
 * Write schemas for the catalogue.
 *
 * Note what is absent: `rating`, `stock.status`, `popularity` and the derived
 * badges are not accepted on any of these. They are computed (see DOMAIN.md), so
 * letting the admin post them would create two sources of truth.
 */

const variant = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1).max(80),
  kind: z.enum(C.VARIANT_KINDS),
  swatch: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex colour')
    .optional()
    .nullable(),
  sku: z.string().trim().min(1).max(60),
  priceDelta: z.number().int().default(0),
  stock: z.number().int().min(0).default(0),
});

const specs = z.object({
  dimensions: z.string().trim().max(200).optional(),
  weight: z.string().trim().max(80).optional(),
  materials: z.array(z.string().trim()).optional(),
  batteries: z.string().trim().max(120).optional(),
  pieces: z.number().int().min(0).nullable().optional(),
  safety: z.array(z.string().trim()).optional(),
  origin: z.string().trim().max(120).optional(),
});

const productBase = {
  name: z.string().trim().min(1, 'A product needs a name').max(140),
  slug: slug.optional(),
  sku: z.string().trim().max(60).optional(),
  tagline: z.string().trim().max(200).optional(),
  description: z.string().trim().max(20000).optional(),

  brand: objectId.nullable().optional(),
  categories: z.array(objectId).optional(),
  collections: z.array(objectId).optional(),

  price: money,
  compareAtPrice: money.nullable().optional(),
  costPrice: money.nullable().optional(),

  images: z.array(image).optional(),
  hasModel3d: z.boolean().optional(),

  variants: z.array(variant).optional(),
  attributes: z
    .array(z.object({ name: z.string().trim().min(1), value: z.string().trim() }))
    .optional(),
  specs: specs.optional(),
  inTheBox: z.array(z.string().trim()).optional(),
  ageRange: ageRange.optional(),

  stock: z
    .object({
      quantity: z.number().int().min(0).optional(),
      lowStockThreshold: z.number().int().min(0).optional(),
      preOrder: z.boolean().optional(),
      restockDate: z.coerce.date().nullable().optional(),
      trackInventory: z.boolean().optional(),
    })
    .optional(),

  // Authored badges only — `new`/`bestseller`/`sale` are derived and rejected here.
  badges: z.array(z.enum(C.AUTHORED_BADGES)).optional(),
  tags: z.array(z.string().trim()).optional(),

  isFeatured: z.boolean().optional(),
  isTrending: z.boolean().optional(),
  isNewArrival: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),

  related: z.array(objectId).optional(),
  bundle: z.array(objectId).optional(),

  status: z.enum(C.PUBLISH_STATUSES).optional(),
  seo,
};

const createProduct = z
  .object(productBase)
  .refine((v) => !v.compareAtPrice || v.compareAtPrice > v.price, {
    message: 'The "was" price must be higher than the current price',
    path: ['compareAtPrice'],
  });

// Partial for PATCH — but `price` must stay a valid money value if sent at all.
const updateProduct = z.object(productBase).partial();

const createCategory = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slug.optional(),
  blurb: z.string().trim().max(300).optional(),
  tone: tone.optional(),
  ageRange: ageRange.nullable().optional(),
  parent: objectId.nullable().optional(),
  image: z.string().trim().nullable().optional(),
  icon: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  seo,
});

const createBrand = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slug.optional(),
  blurb: z.string().trim().max(300).optional(),
  story: z.string().trim().max(10000).optional(),
  origin: z.string().trim().max(120).optional(),
  founded: z.number().int().min(1600).max(new Date().getFullYear()).nullable().optional(),
  tone: tone.optional(),
  logo: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  seo,
});

const createCollection = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slug.optional(),
  blurb: z.string().trim().max(300).optional(),
  tone: tone.optional(),
  chapters: z
    .array(z.object({ heading: z.string().trim().min(1).max(120), body: z.string().trim().min(1) }))
    .optional(),
  heroImage: z.string().trim().nullable().optional(),
  isSeasonal: z.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  seo,
});

/** Bulk stock edit from the inventory screen. */
const adjustStock = z.object({
  quantity: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  preOrder: z.boolean().optional(),
  restockDate: z.coerce.date().nullable().optional(),
  trackInventory: z.boolean().optional(),
  variants: z
    .array(z.object({ id: z.string(), stock: z.number().int().min(0) }))
    .optional(),
});

const reorder = z.object({
  items: z.array(z.object({ id: objectId, sortOrder: z.number().int() })).min(1),
});

module.exports = {
  createProduct,
  updateProduct,
  createCategory,
  updateCategory: createCategory.partial(),
  createBrand,
  updateBrand: createBrand.partial(),
  createCollection,
  updateCollection: createCollection.partial(),
  adjustStock,
  reorder,
};
