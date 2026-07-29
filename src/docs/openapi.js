const C = require('../config/constants');

/**
 * OpenAPI 3.1 description of the API.
 *
 * The thirteen admin CRUD resources are generated from a table rather than
 * written out, for the same reason the routes are: thirteen hand-written copies
 * of the same five paths drift, and a wrong spec is worse than no spec.
 */

const envelope = (dataSchema, paginated = false) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', const: true },
    data: paginated ? { type: 'array', items: dataSchema } : dataSchema,
    ...(paginated
      ? {
          meta: {
            type: 'object',
            properties: {
              total: { type: 'integer' },
              page: { type: 'integer' },
              pages: { type: 'integer' },
              limit: { type: 'integer' },
            },
          },
        }
      : {}),
  },
});

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const errorResponse = {
  description: 'Error',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', const: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              code: { type: 'string' },
              details: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
    },
  },
};

const jsonBody = (schema) => ({
  required: true,
  content: { 'application/json': { schema } },
});

const okJson = (schema, paginated) => ({
  description: 'Success',
  content: { 'application/json': { schema: envelope(schema, paginated) } },
});

// --- Reusable parameters -----------------------------------------------------

const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 24 } },
];

const idPath = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
};

const slugPath = { name: 'slug', in: 'path', required: true, schema: { type: 'string' } };

// --- Generated admin CRUD ----------------------------------------------------

/** [path, tag, singular] for every resource that uses the CRUD factory. */
const CRUD_RESOURCES = [
  ['/admin/categories', 'Admin · Catalogue', 'Category'],
  ['/admin/brands', 'Admin · Catalogue', 'Brand'],
  ['/admin/collections', 'Admin · Catalogue', 'Collection'],
  ['/admin/posts', 'Admin · Content', 'Post'],
  ['/admin/faqs', 'Admin · Content', 'FAQ'],
  ['/admin/testimonials', 'Admin · Content', 'Testimonial'],
  ['/admin/banners', 'Admin · Content', 'Banner'],
  ['/admin/home-sections', 'Admin · Content', 'Home section'],
  ['/admin/coupons', 'Admin · Commerce', 'Coupon'],
  ['/admin/shipping-options', 'Admin · Commerce', 'Delivery option'],
];

function crudPaths() {
  const out = {};

  for (const [path, tag, name] of CRUD_RESOURCES) {
    out[path] = {
      get: {
        tags: [tag],
        summary: `List ${name.toLowerCase()}s`,
        security: [{ bearerAuth: [] }],
        parameters: [
          ...pageParams,
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Free-text search' },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { 200: okJson({ type: 'object' }, true), default: errorResponse },
      },
      post: {
        tags: [tag],
        summary: `Create a ${name.toLowerCase()}`,
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody({ type: 'object' }),
        responses: { 201: okJson({ type: 'object' }), default: errorResponse },
      },
    };

    out[`${path}/{id}`] = {
      get: {
        tags: [tag],
        summary: `Get one ${name.toLowerCase()}`,
        security: [{ bearerAuth: [] }],
        parameters: [idPath],
        responses: { 200: okJson({ type: 'object' }), default: errorResponse },
      },
      patch: {
        tags: [tag],
        summary: `Update a ${name.toLowerCase()}`,
        security: [{ bearerAuth: [] }],
        parameters: [idPath],
        requestBody: jsonBody({ type: 'object' }),
        responses: { 200: okJson({ type: 'object' }), default: errorResponse },
      },
      delete: {
        tags: [tag],
        summary: `Delete a ${name.toLowerCase()}`,
        description: 'Refused with 409 when other records still reference this one.',
        security: [{ bearerAuth: [] }],
        parameters: [idPath],
        responses: { 204: { description: 'Deleted' }, default: errorResponse },
      },
    };

    out[`${path}/reorder`] = {
      post: {
        tags: [tag],
        summary: `Reorder ${name.toLowerCase()}s`,
        security: [{ bearerAuth: [] }],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'sortOrder'],
                properties: { id: { type: 'string' }, sortOrder: { type: 'integer' } },
              },
            },
          },
        }),
        responses: { 200: okJson({ type: 'object' }), default: errorResponse },
      },
    };
  }

  return out;
}

module.exports = {
  openapi: '3.1.0',
  info: {
    title: 'LUMO API',
    version: '1.0.0',
    description: [
      'Backs the LUMO storefront (Toys-Website) and admin panel (Toys-Admin).',
      '',
      '**Money is always an integer in minor units (pence).** `2495` is £24.95.',
      'There are no floating-point amounts anywhere in this API.',
      '',
      'Relations are stored as ObjectIds but serialised as slugs (`brandSlug`,',
      '`categorySlugs`), matching the storefront\'s URLs and its Zod contract.',
      '',
      'See `DOMAIN.md` in the repository for the full domain contract, including',
      'which fields are authored and which are derived.',
    ].join('\n'),
  },
  servers: [
    { url: 'http://localhost:5001/api/v1', description: 'Local' },
    { url: '/api/v1', description: 'Same origin' },
  ],
  tags: [
    { name: 'Storefront', description: 'Public reads. No authentication.' },
    { name: 'Auth', description: 'Registration, sign-in and credential recovery.' },
    { name: 'Account', description: "The signed-in customer's own data." },
    { name: 'Admin · Catalogue' },
    { name: 'Admin · Content' },
    { name: 'Admin · Commerce' },
    { name: 'Admin · Orders' },
    { name: 'Admin · People' },
    { name: 'Admin · Analytics' },
    { name: 'Admin · Uploads' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Product: {
        type: 'object',
        description: 'Storefront shape. Matches the Zod `Product` in Toys-Website.',
        properties: {
          id: { type: 'string' },
          slug: { type: 'string' },
          name: { type: 'string' },
          tagline: { type: 'string' },
          description: { type: 'string' },
          brandSlug: { type: 'string' },
          categorySlugs: { type: 'array', items: { type: 'string' } },
          collectionSlugs: { type: 'array', items: { type: 'string' } },
          price: { type: 'integer', description: 'Minor units (pence)' },
          compareAtPrice: { type: ['integer', 'null'] },
          currency: { type: 'string', const: 'GBP' },
          images: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                url: { type: ['string', 'null'], description: 'null when no photo is uploaded' },
                seed: { type: 'string', description: 'Gradient placeholder seed' },
                alt: { type: 'string', minLength: 4 },
                type: { type: 'string', enum: C.IMAGE_TYPES },
              },
            },
          },
          hasModel3d: { type: 'boolean' },
          variants: { type: 'array', items: ref('Variant') },
          ageRange: {
            type: 'object',
            properties: { min: { type: 'integer' }, max: { type: 'integer' } },
          },
          rating: {
            type: 'object',
            description: 'Derived from approved reviews. Not writable.',
            properties: {
              average: { type: 'number' },
              count: { type: 'integer' },
              distribution: { type: 'array', items: { type: 'integer' }, minItems: 5, maxItems: 5 },
            },
          },
          badges: { type: 'array', items: { type: 'string', enum: C.BADGES } },
          stock: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: C.STOCK_STATUSES, description: 'Derived from quantity' },
              quantity: { type: 'integer' },
              restockDate: { type: ['string', 'null'], format: 'date-time' },
            },
          },
          tags: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string', format: 'date-time' },
          popularity: { type: 'integer' },
          isFeatured: { type: 'boolean' },
          isTrending: { type: 'boolean' },
        },
      },
      Variant: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          kind: { type: 'string', enum: C.VARIANT_KINDS },
          swatch: { type: 'string', description: 'Hex, colour variants only' },
          sku: { type: 'string' },
          priceDelta: { type: 'integer', description: 'Added to the parent price; may be negative' },
          stock: { type: 'integer' },
        },
      },
      Facets: {
        type: 'object',
        description: 'Each facet is counted ignoring its own dimension.',
        properties: {
          categories: { type: 'object', additionalProperties: { type: 'integer' } },
          brands: { type: 'object', additionalProperties: { type: 'integer' } },
          badges: { type: 'object', additionalProperties: { type: 'integer' } },
          priceMin: { type: 'integer' },
          priceMax: { type: 'integer' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          orderNumber: { type: 'string', example: 'LUMO-EM4-A7X2K9' },
          email: { type: 'string' },
          items: { type: 'array', items: { type: 'object' } },
          totals: {
            type: 'object',
            description: 'All server-computed. Client-supplied totals are ignored.',
            properties: {
              subtotal: { type: 'integer' },
              discount: { type: 'integer' },
              shipping: { type: 'integer' },
              tax: { type: 'integer' },
              grandTotal: { type: 'integer' },
            },
          },
          status: { type: 'string', enum: C.ORDER_STATUSES },
        },
      },
      Session: {
        type: 'object',
        properties: { token: { type: 'string' }, user: { type: 'object' } },
      },
    },
  },
  paths: {
    // --- Storefront ---------------------------------------------------------
    '/bootstrap': {
      get: {
        tags: ['Storefront'],
        summary: 'Nav, settings and live announcements in one call',
        description: 'Everything the root layout needs on every route.',
        responses: { 200: okJson({ type: 'object' }), default: errorResponse },
      },
    },
    '/home': {
      get: {
        tags: ['Storefront'],
        summary: 'Homepage sections, fully resolved',
        description:
          'Each section arrives with its products or collections already attached, ordered by the admin.',
        responses: { 200: okJson({ type: 'array', items: { type: 'object' } }), default: errorResponse },
      },
    },
    '/products': {
      get: {
        tags: ['Storefront'],
        summary: 'List products',
        description: 'Mirrors the filter, sort and facet semantics of the storefront catalogue layer.',
        parameters: [
          ...pageParams,
          { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Comma-separated slugs' },
          { name: 'brand', in: 'query', schema: { type: 'string' } },
          { name: 'collection', in: 'query', schema: { type: 'string' } },
          { name: 'min', in: 'query', schema: { type: 'integer' }, description: 'Minor units' },
          { name: 'max', in: 'query', schema: { type: 'integer' } },
          { name: 'rating', in: 'query', schema: { type: 'number' } },
          { name: 'ageMin', in: 'query', schema: { type: 'integer' } },
          { name: 'ageMax', in: 'query', schema: { type: 'integer' } },
          { name: 'badge', in: 'query', schema: { type: 'string' } },
          { name: 'inStock', in: 'query', schema: { type: 'boolean' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: Object.keys(C.PRODUCT_SORTS) } },
        ],
        responses: {
          200: {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    envelope(ref('Product'), true),
                    { type: 'object', properties: { facets: ref('Facets') } },
                  ],
                },
              },
            },
          },
          default: errorResponse,
        },
      },
    },
    '/products/{slug}': {
      get: {
        tags: ['Storefront'],
        summary: 'Get a product',
        parameters: [slugPath],
        responses: { 200: okJson(ref('Product')), default: errorResponse },
      },
    },
    '/products/{slug}/recommendations': {
      get: {
        tags: ['Storefront'],
        summary: 'Four recommendation rails',
        parameters: [slugPath],
        responses: { 200: okJson({ type: 'object' }), default: errorResponse },
      },
    },
    '/products/{slug}/reviews': {
      get: {
        tags: ['Storefront'],
        summary: 'Approved reviews for a product',
        parameters: [
          slugPath,
          ...pageParams,
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['recent', 'helpful', 'rating'] } },
          { name: 'rating', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 5 } },
        ],
        responses: { 200: okJson({ type: 'object' }, true), default: errorResponse },
      },
    },
    '/categories': {
      get: {
        tags: ['Storefront'],
        summary: 'Active category tree (nested)',
        responses: { 200: okJson({ type: 'array', items: { type: 'object' } }), default: errorResponse },
      },
    },
    '/brands': {
      get: { tags: ['Storefront'], summary: 'Active brands', responses: { 200: okJson({ type: 'array', items: { type: 'object' } }), default: errorResponse } },
    },
    '/collections': {
      get: { tags: ['Storefront'], summary: 'Active collections', responses: { 200: okJson({ type: 'array', items: { type: 'object' } }), default: errorResponse } },
    },
    '/faqs': { get: { tags: ['Storefront'], summary: 'Published FAQs', responses: { 200: okJson({ type: 'array', items: { type: 'object' } }), default: errorResponse } } },
    '/testimonials': { get: { tags: ['Storefront'], summary: 'Published testimonials', responses: { 200: okJson({ type: 'array', items: { type: 'object' } }), default: errorResponse } } },
    '/banners': {
      get: {
        tags: ['Storefront'],
        summary: 'Live banners',
        description: 'Filtered to those active and inside their scheduling window.',
        parameters: [{ name: 'placement', in: 'query', schema: { type: 'string', enum: C.BANNER_PLACEMENTS } }],
        responses: { 200: okJson({ type: 'array', items: { type: 'object' } }), default: errorResponse },
      },
    },
    '/reviews': {
      get: { tags: ['Storefront'], summary: 'Approved reviews across all products', parameters: pageParams, responses: { 200: okJson({ type: 'object' }, true), default: errorResponse } },
      post: {
        tags: ['Storefront'],
        summary: 'Submit a review',
        description: 'Always created as `pending`. `verified` is decided server-side from order history.',
        requestBody: jsonBody({ type: 'object' }),
        responses: { 201: okJson({ type: 'object' }), default: errorResponse },
      },
    },
    '/coupons/validate': {
      post: {
        tags: ['Storefront'],
        summary: 'Validate a coupon against a subtotal',
        requestBody: jsonBody({
          type: 'object',
          required: ['code', 'subtotal'],
          properties: { code: { type: 'string' }, subtotal: { type: 'integer' } },
        }),
        responses: { 200: okJson({ type: 'object' }), default: errorResponse },
      },
    },
    '/orders/quote': {
      post: {
        tags: ['Storefront'],
        summary: 'Price a basket without placing an order',
        description: 'Uses the same arithmetic as checkout, so the basket total cannot diverge from the charge.',
        requestBody: jsonBody({ type: 'object' }),
        responses: { 200: okJson({ type: 'object' }), default: errorResponse },
      },
    },
    '/orders': {
      post: {
        tags: ['Storefront'],
        summary: 'Place an order',
        description:
          'Prices are re-read from the database; any price or total in the request body is ignored. Stock is decremented transactionally.',
        requestBody: jsonBody({ type: 'object' }),
        responses: { 201: okJson(ref('Order')), default: errorResponse },
      },
    },
    '/orders/track/{orderNumber}': {
      get: {
        tags: ['Storefront'],
        summary: 'Track an order without signing in',
        parameters: [
          { name: 'orderNumber', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'email', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: okJson(ref('Order')), default: errorResponse },
      },
    },

    // --- Auth ---------------------------------------------------------------
    '/auth/register': {
      post: { tags: ['Auth'], summary: 'Create a customer account', requestBody: jsonBody({ type: 'object' }), responses: { 201: okJson(ref('Session')), default: errorResponse } },
    },
    '/auth/login': {
      post: { tags: ['Auth'], summary: 'Sign in', requestBody: jsonBody({ type: 'object' }), responses: { 200: okJson(ref('Session')), default: errorResponse } },
    },
    '/auth/admin/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in to the admin panel',
        description: 'Rejects accounts whose role carries no permissions.',
        requestBody: jsonBody({ type: 'object' }),
        responses: { 200: okJson(ref('Session')), default: errorResponse },
      },
    },
    '/auth/me': {
      get: { tags: ['Auth'], summary: 'Current user', security: [{ bearerAuth: [] }], responses: { 200: okJson({ type: 'object' }), default: errorResponse } },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request a reset link',
        description: 'Responds identically whether or not the address exists, to avoid account enumeration.',
        requestBody: jsonBody({ type: 'object' }),
        responses: { 200: okJson({ type: 'object' }), default: errorResponse },
      },
    },
    '/auth/reset-password': {
      post: { tags: ['Auth'], summary: 'Set a new password from a reset token', requestBody: jsonBody({ type: 'object' }), responses: { 200: okJson(ref('Session')), default: errorResponse } },
    },

    // --- Account ------------------------------------------------------------
    '/account/profile': {
      patch: { tags: ['Account'], summary: 'Update your profile', security: [{ bearerAuth: [] }], requestBody: jsonBody({ type: 'object' }), responses: { 200: okJson({ type: 'object' }), default: errorResponse } },
    },
    '/account/addresses': {
      get: { tags: ['Account'], summary: 'Your addresses', security: [{ bearerAuth: [] }], responses: { 200: okJson({ type: 'array', items: { type: 'object' } }), default: errorResponse } },
      post: { tags: ['Account'], summary: 'Add an address', security: [{ bearerAuth: [] }], requestBody: jsonBody({ type: 'object' }), responses: { 201: okJson({ type: 'array', items: { type: 'object' } }), default: errorResponse } },
    },
    '/account/wishlist': {
      get: { tags: ['Account'], summary: 'Your wishlist', security: [{ bearerAuth: [] }], responses: { 200: okJson(ref('Product'), true), default: errorResponse } },
    },
    '/account/orders': {
      get: { tags: ['Account'], summary: 'Your orders', security: [{ bearerAuth: [] }], parameters: pageParams, responses: { 200: okJson(ref('Order'), true), default: errorResponse } },
    },

    // --- Admin: products ----------------------------------------------------
    '/admin/products': {
      get: {
        tags: ['Admin · Catalogue'],
        summary: 'List products (including drafts)',
        security: [{ bearerAuth: [] }],
        parameters: [
          ...pageParams,
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: C.PUBLISH_STATUSES } },
          { name: 'lowStock', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { 200: okJson({ type: 'object' }, true), default: errorResponse },
      },
      post: { tags: ['Admin · Catalogue'], summary: 'Create a product', security: [{ bearerAuth: [] }], requestBody: jsonBody({ type: 'object' }), responses: { 201: okJson(ref('Product')), default: errorResponse } },
    },
    '/admin/products/{id}': {
      get: { tags: ['Admin · Catalogue'], summary: 'Get a product for editing', security: [{ bearerAuth: [] }], parameters: [idPath], responses: { 200: okJson({ type: 'object' }), default: errorResponse } },
      patch: { tags: ['Admin · Catalogue'], summary: 'Update a product', security: [{ bearerAuth: [] }], parameters: [idPath], requestBody: jsonBody({ type: 'object' }), responses: { 200: okJson(ref('Product')), default: errorResponse } },
      delete: {
        tags: ['Admin · Catalogue'],
        summary: 'Delete a product',
        description: 'Refused with 409 if the product appears in any order — archive it instead.',
        security: [{ bearerAuth: [] }],
        parameters: [idPath],
        responses: { 204: { description: 'Deleted' }, default: errorResponse },
      },
    },
    '/admin/products/{id}/stock': {
      patch: { tags: ['Admin · Catalogue'], summary: 'Adjust stock', security: [{ bearerAuth: [] }], parameters: [idPath], requestBody: jsonBody({ type: 'object' }), responses: { 200: okJson({ type: 'object' }), default: errorResponse } },
    },
    '/admin/inventory': {
      get: { tags: ['Admin · Catalogue'], summary: 'Inventory, lowest stock first', security: [{ bearerAuth: [] }], parameters: [...pageParams, { name: 'lowOnly', in: 'query', schema: { type: 'boolean' } }], responses: { 200: okJson({ type: 'object' }, true), default: errorResponse } },
    },

    // --- Admin: reviews -----------------------------------------------------
    '/admin/reviews': {
      get: { tags: ['Admin · Content'], summary: 'Moderation queue', security: [{ bearerAuth: [] }], parameters: [...pageParams, { name: 'status', in: 'query', schema: { type: 'string', enum: C.MODERATION_STATUSES } }], responses: { 200: okJson({ type: 'object' }, true), default: errorResponse } },
    },
    '/admin/reviews/{id}': {
      patch: {
        tags: ['Admin · Content'],
        summary: 'Approve or reject a review',
        description: "Recomputes the product's rating immediately.",
        security: [{ bearerAuth: [] }],
        parameters: [idPath],
        requestBody: jsonBody({ type: 'object', properties: { status: { type: 'string', enum: C.MODERATION_STATUSES } } }),
        responses: { 200: okJson({ type: 'object' }), default: errorResponse },
      },
      delete: { tags: ['Admin · Content'], summary: 'Delete a review', security: [{ bearerAuth: [] }], parameters: [idPath], responses: { 204: { description: 'Deleted' }, default: errorResponse } },
    },

    // --- Admin: orders ------------------------------------------------------
    '/admin/orders': {
      get: { tags: ['Admin · Orders'], summary: 'List orders', security: [{ bearerAuth: [] }], parameters: [...pageParams, { name: 'status', in: 'query', schema: { type: 'string', enum: C.ORDER_STATUSES } }, { name: 'q', in: 'query', schema: { type: 'string' } }], responses: { 200: okJson({ type: 'object' }, true), default: errorResponse } },
    },
    '/admin/orders/{id}': {
      get: { tags: ['Admin · Orders'], summary: 'Order detail', security: [{ bearerAuth: [] }], parameters: [idPath], responses: { 200: okJson(ref('Order')), default: errorResponse } },
    },
    '/admin/orders/{id}/status': {
      patch: {
        tags: ['Admin · Orders'],
        summary: 'Change order status',
        description: 'Guarded by the transition table; cancelling or refunding returns stock.',
        security: [{ bearerAuth: [] }],
        parameters: [idPath],
        requestBody: jsonBody({ type: 'object', properties: { status: { type: 'string', enum: C.ORDER_STATUSES }, note: { type: 'string' } } }),
        responses: { 200: okJson(ref('Order')), default: errorResponse },
      },
    },
    '/admin/orders/{id}/invoice': {
      get: { tags: ['Admin · Orders'], summary: 'Invoice data', security: [{ bearerAuth: [] }], parameters: [idPath], responses: { 200: okJson({ type: 'object' }), default: errorResponse } },
    },

    // --- Admin: people ------------------------------------------------------
    '/admin/customers': {
      get: { tags: ['Admin · People'], summary: 'List customers with order totals', security: [{ bearerAuth: [] }], parameters: [...pageParams, { name: 'q', in: 'query', schema: { type: 'string' } }, { name: 'staff', in: 'query', schema: { type: 'boolean' } }], responses: { 200: okJson({ type: 'object' }, true), default: errorResponse } },
      post: { tags: ['Admin · People'], summary: 'Create a staff account', security: [{ bearerAuth: [] }], requestBody: jsonBody({ type: 'object' }), responses: { 201: okJson({ type: 'object' }), default: errorResponse } },
    },
    '/admin/customers/{id}': {
      get: { tags: ['Admin · People'], summary: 'Customer detail with order history', security: [{ bearerAuth: [] }], parameters: [idPath], responses: { 200: okJson({ type: 'object' }), default: errorResponse } },
    },
    '/admin/roles': {
      get: { tags: ['Admin · People'], summary: 'List roles', security: [{ bearerAuth: [] }], responses: { 200: okJson({ type: 'array', items: { type: 'object' } }), default: errorResponse } },
      post: { tags: ['Admin · People'], summary: 'Create a role', security: [{ bearerAuth: [] }], requestBody: jsonBody({ type: 'object' }), responses: { 201: okJson({ type: 'object' }), default: errorResponse } },
    },
    '/admin/permissions': {
      get: { tags: ['Admin · People'], summary: 'Permission catalogue', security: [{ bearerAuth: [] }], responses: { 200: okJson({ type: 'object' }), default: errorResponse } },
    },

    // --- Admin: settings & nav ----------------------------------------------
    '/admin/settings': {
      get: { tags: ['Admin · Content'], summary: 'Site settings', security: [{ bearerAuth: [] }], responses: { 200: okJson({ type: 'object' }), default: errorResponse } },
      patch: { tags: ['Admin · Content'], summary: 'Update settings', description: 'Merged per block, so a partial patch does not clear other blocks.', security: [{ bearerAuth: [] }], requestBody: jsonBody({ type: 'object' }), responses: { 200: okJson({ type: 'object' }), default: errorResponse } },
    },
    '/admin/nav/{location}': {
      get: { tags: ['Admin · Content'], summary: 'Get a menu', security: [{ bearerAuth: [] }], parameters: [{ name: 'location', in: 'path', required: true, schema: { type: 'string', enum: C.NAV_LOCATIONS } }], responses: { 200: okJson({ type: 'object' }), default: errorResponse } },
      put: { tags: ['Admin · Content'], summary: 'Replace a menu', security: [{ bearerAuth: [] }], parameters: [{ name: 'location', in: 'path', required: true, schema: { type: 'string', enum: C.NAV_LOCATIONS } }], requestBody: jsonBody({ type: 'object' }), responses: { 200: okJson({ type: 'object' }), default: errorResponse } },
    },

    // --- Admin: analytics & uploads -----------------------------------------
    '/admin/analytics/overview': {
      get: { tags: ['Admin · Analytics'], summary: 'Headline metrics with period-on-period change', security: [{ bearerAuth: [] }], parameters: [{ name: 'from', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } }], responses: { 200: okJson({ type: 'object' }), default: errorResponse } },
    },
    '/admin/analytics/sales': {
      get: { tags: ['Admin · Analytics'], summary: 'Daily revenue series (gaps filled with zeroes)', security: [{ bearerAuth: [] }], responses: { 200: okJson({ type: 'array', items: { type: 'object' } }), default: errorResponse } },
    },
    '/admin/uploads/{folder}': {
      get: { tags: ['Admin · Uploads'], summary: 'List uploaded files', security: [{ bearerAuth: [] }], parameters: [{ name: 'folder', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: okJson({ type: 'array', items: { type: 'object' } }), default: errorResponse } },
      post: {
        tags: ['Admin · Uploads'],
        summary: 'Upload one image',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'folder', in: 'path', required: true, schema: { type: 'string', enum: ['products', 'categories', 'brands', 'collections', 'banners', 'misc'] } }],
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } },
        },
        responses: { 201: okJson({ type: 'object' }), default: errorResponse },
      },
    },

    ...crudPaths(),
  },
};
