const { AUTHORED_BADGES } = require('../config/constants');

/**
 * Translation layer between the database shape and the storefront contract.
 *
 * The storefront parses API responses with the Zod schemas in
 * `Toys-Website/src/data/schemas/index.ts`, so these functions must emit exactly
 * what those schemas accept — including the parts that are easy to get wrong:
 *
 *   • `images` has `.min(1)`, so a product with no uploads still needs one entry.
 *   • `alt` has `.min(4)`, so an empty alt string fails the parse.
 *   • dates are `z.string()`, not Date objects.
 *   • relations are slugs, not ObjectIds.
 *
 * Getting any of these wrong shows up as a blank product page, not an error, so
 * they are handled here once rather than per-controller.
 */

const iso = (value) => (value ? new Date(value).toISOString() : null);

/** A populated ref → its slug. Tolerates unpopulated ObjectIds by dropping them. */
const slugOf = (ref) => (ref && typeof ref === 'object' && ref.slug ? ref.slug : null);
const slugsOf = (refs) => (refs || []).map(slugOf).filter(Boolean);

const idOf = (ref) => {
  if (!ref) return null;
  if (typeof ref === 'object') return String(ref._id || ref.id);
  return String(ref);
};

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/**
 * Authored badges plus the three derived ones. Derivation lives here rather than
 * on the model so it reflects the moment of the request — a "new" badge should
 * fall off on day 31 without anything having written to the document.
 */
function badgesFor(doc) {
  const authored = (doc.badges || []).filter((b) => AUTHORED_BADGES.includes(b));
  const out = new Set(authored);

  const created = doc.publishedAt || doc.createdAt;
  if (doc.isNewArrival || (created && Date.now() - new Date(created).getTime() < THIRTY_DAYS)) {
    out.add('new');
  }
  if (doc.isBestSeller) out.add('bestseller');
  if (doc.compareAtPrice && doc.compareAtPrice > doc.price) out.add('sale');

  return [...out];
}

/**
 * Guarantees a non-empty image list. A product created in the admin panel with
 * no photography still renders as the storefront's deterministic gradient tile.
 */
function imagesFor(doc) {
  const list = (doc.images || [])
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((img) => ({
      url: img.url || null,
      seed: img.seed || doc.slug,
      // Zod requires min(4); fall back to something descriptive rather than "".
      alt: img.alt && img.alt.length >= 4 ? img.alt : `${doc.name} — product image`,
      type: img.type || 'studio',
    }));

  if (list.length) return list;

  return [
    {
      url: null,
      seed: doc.slug,
      alt: `${doc.name} — product image`,
      type: 'studio',
    },
  ];
}

/** Full product, for a product detail page. */
function product(doc) {
  if (!doc) return null;

  return {
    id: idOf(doc),
    slug: doc.slug,
    name: doc.name,
    tagline: doc.tagline || '',
    description: doc.description || '',
    sku: doc.sku || '',

    brandSlug: slugOf(doc.brand) || '',
    categorySlugs: slugsOf(doc.categories),
    collectionSlugs: slugsOf(doc.collections),

    price: doc.price,
    compareAtPrice: doc.compareAtPrice && doc.compareAtPrice > doc.price ? doc.compareAtPrice : null,
    currency: doc.currency || 'GBP',

    images: imagesFor(doc),
    hasModel3d: Boolean(doc.hasModel3d),

    variants: (doc.variants || []).map((v) => ({
      id: String(v._id || v.id),
      label: v.label,
      kind: v.kind,
      ...(v.swatch ? { swatch: v.swatch } : {}),
      sku: v.sku,
      priceDelta: v.priceDelta || 0,
      stock: v.stock || 0,
    })),
    attributes: (doc.attributes || []).map((a) => ({ name: a.name, value: a.value })),

    ageRange: {
      min: doc.ageRange?.min ?? 0,
      max: doc.ageRange?.max ?? 99,
    },

    rating: {
      average: Number((doc.rating?.average ?? 0).toFixed(2)),
      count: doc.rating?.count ?? 0,
      distribution: doc.rating?.distribution?.length === 5
        ? doc.rating.distribution
        : [0, 0, 0, 0, 0],
    },

    badges: badgesFor(doc),

    stock: {
      status: doc.stock?.status || 'sold-out',
      quantity: doc.stock?.quantity ?? 0,
      restockDate: iso(doc.stock?.restockDate),
    },

    specs: {
      dimensions: doc.specs?.dimensions || '',
      weight: doc.specs?.weight || '',
      materials: doc.specs?.materials?.length ? doc.specs.materials : ['Not specified'],
      batteries: doc.specs?.batteries || 'None',
      pieces: doc.specs?.pieces ?? null,
      safety: doc.specs?.safety || [],
      origin: doc.specs?.origin || '',
    },

    inTheBox: doc.inTheBox || [],
    tags: doc.tags || [],
    relatedIds: (doc.related || []).map(idOf).filter(Boolean),
    bundleIds: (doc.bundle || []).map(idOf).filter(Boolean),

    createdAt: iso(doc.publishedAt || doc.createdAt),
    popularity: doc.popularity || 0,
    isFeatured: Boolean(doc.isFeatured),
    isTrending: Boolean(doc.isTrending),
  };
}

/**
 * Card-sized product. Same shape, minus the fields only the detail page reads —
 * a 24-card grid does not need every spec and description.
 */
function productCard(doc) {
  const full = product(doc);
  if (!full) return null;
  const { description, specs, inTheBox, relatedIds, bundleIds, attributes, ...rest } = full;
  return rest;
}

const category = (doc) =>
  doc && {
    id: idOf(doc),
    slug: doc.slug,
    name: doc.name,
    blurb: doc.blurb || '',
    tone: doc.tone,
    ageRange: doc.ageRange ? { min: doc.ageRange.min, max: doc.ageRange.max } : null,
    image: doc.image || null,
    icon: doc.icon || null,
    parentSlug: slugOf(doc.parent),
    sortOrder: doc.sortOrder || 0,
  };

const brand = (doc) =>
  doc && {
    id: idOf(doc),
    slug: doc.slug,
    name: doc.name,
    blurb: doc.blurb || '',
    story: doc.story || '',
    origin: doc.origin || '',
    founded: doc.founded ?? null,
    tone: doc.tone,
    logo: doc.logo || null,
  };

const collection = (doc) =>
  doc && {
    id: idOf(doc),
    slug: doc.slug,
    name: doc.name,
    blurb: doc.blurb || '',
    tone: doc.tone,
    chapters: (doc.chapters || []).map((c) => ({ heading: c.heading, body: c.body })),
    heroImage: doc.heroImage || null,
    isSeasonal: Boolean(doc.isSeasonal),
  };

const review = (doc) =>
  doc && {
    id: idOf(doc),
    productId: idOf(doc.product),
    productSlug: slugOf(doc.product),
    author: doc.author,
    rating: doc.rating,
    title: doc.title,
    body: doc.body,
    createdAt: iso(doc.createdAt),
    verified: Boolean(doc.verified),
    helpful: doc.helpful || 0,
    boughtFor: doc.boughtFor || null,
  };

const post = (doc) =>
  doc && {
    id: idOf(doc),
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt || '',
    body: doc.body || [],
    author: doc.author,
    publishedAt: iso(doc.publishedAt),
    // Virtual — present on lean({virtuals:true}) reads and on hydrated docs alike.
    readingMinutes:
      doc.readingMinutes ??
      Math.max(1, Math.round((doc.body || []).join(' ').split(/\s+/).filter(Boolean).length / 200)),
    topic: doc.topic,
    tone: doc.tone,
    coverImage: doc.coverImage || null,
  };

const faq = (doc) =>
  doc && { id: idOf(doc), question: doc.question, answer: doc.answer, group: doc.group };

const testimonial = (doc) =>
  doc && {
    id: idOf(doc),
    quote: doc.quote,
    author: doc.author,
    role: doc.role || '',
    avatar: doc.avatar || null,
  };

const shippingOption = (doc) =>
  doc && {
    id: doc.key,
    label: doc.label,
    description: doc.description || '',
    price: doc.price,
    minDays: doc.minDays,
    maxDays: doc.maxDays,
  };

const coupon = (doc) =>
  doc && {
    code: doc.code,
    value: doc.value,
    description: doc.description || '',
    minSpend: doc.minSpend || 0,
  };

const banner = (doc) =>
  doc && {
    id: idOf(doc),
    placement: doc.placement,
    title: doc.title,
    subtitle: doc.subtitle || '',
    image: doc.image || null,
    video: doc.video || null,
    href: doc.href || null,
    ctaLabel: doc.ctaLabel || null,
    tone: doc.tone,
  };

const navLink = (link) => ({
  label: link.label,
  href: link.href,
  ...(link.note ? { note: link.note } : {}),
});

const navMenu = (doc) =>
  doc && {
    location: doc.location,
    links: (doc.links || [])
      .filter((l) => l.isActive !== false)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map(navLink),
    columns: (doc.columns || [])
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map((col) => ({
        title: col.title,
        tone: col.tone,
        links: (col.links || [])
          .filter((l) => l.isActive !== false)
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          .map(navLink),
      })),
  };

const order = (doc, { includeInternal = false } = {}) =>
  doc && {
    id: idOf(doc),
    orderNumber: doc.orderNumber,
    email: doc.email,
    phone: doc.phone || '',
    items: (doc.items || []).map((i) => ({
      id: String(i._id || i.id),
      productId: idOf(i.product),
      name: i.name,
      slug: i.slug,
      sku: i.sku || '',
      image: i.image || null,
      imageSeed: i.imageSeed || i.slug,
      variantId: i.variantId || null,
      variantLabel: i.variantLabel || null,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    totals: {
      subtotal: doc.totals?.subtotal ?? 0,
      discount: doc.totals?.discount ?? 0,
      shipping: doc.totals?.shipping ?? 0,
      tax: doc.totals?.tax ?? 0,
      grandTotal: doc.totals?.grandTotal ?? 0,
    },
    currency: doc.currency || 'GBP',
    coupon: doc.coupon?.code ? doc.coupon : null,
    shipping: {
      optionKey: doc.shipping?.optionKey || null,
      optionLabel: doc.shipping?.optionLabel || null,
      address: doc.shipping?.address || null,
      trackingNumber: doc.shipping?.trackingNumber || null,
      carrier: doc.shipping?.carrier || null,
      shippedAt: iso(doc.shipping?.shippedAt),
      deliveredAt: iso(doc.shipping?.deliveredAt),
      estimatedMinDays: doc.shipping?.estimatedMinDays ?? null,
      estimatedMaxDays: doc.shipping?.estimatedMaxDays ?? null,
    },
    payment: {
      method: doc.payment?.method || 'unpaid',
      status: doc.payment?.status || 'unpaid',
      paidAt: iso(doc.payment?.paidAt),
    },
    status: doc.status,
    statusHistory: (doc.statusHistory || []).map((h) => ({
      status: h.status,
      at: iso(h.at),
      note: h.note || null,
    })),
    giftWrap: Boolean(doc.giftWrap),
    giftNote: doc.giftNote || null,
    customerNote: doc.customerNote || null,
    itemCount: (doc.items || []).reduce((s, i) => s + i.quantity, 0),
    createdAt: iso(doc.createdAt),
    ...(includeInternal
      ? { internalNote: doc.internalNote || null, billingAddress: doc.billingAddress || null }
      : {}),
  };

const customer = (doc) =>
  doc && {
    id: idOf(doc),
    firstName: doc.firstName,
    lastName: doc.lastName || '',
    fullName: [doc.firstName, doc.lastName].filter(Boolean).join(' '),
    email: doc.email,
    phone: doc.phone || '',
    role: doc.role && typeof doc.role === 'object'
      ? { id: idOf(doc.role), name: doc.role.name, slug: doc.role.slug, permissions: doc.role.permissions }
      : null,
    addresses: doc.addresses || [],
    isActive: doc.isActive !== false,
    isEmailVerified: Boolean(doc.isEmailVerified),
    lastLoginAt: iso(doc.lastLoginAt),
    createdAt: iso(doc.createdAt),
  };

const settings = (doc) =>
  doc && {
    site: doc.site,
    contact: doc.contact,
    social: doc.social || [],
    footer: doc.footer,
    seo: doc.seo,
    commerce: doc.commerce,
  };

module.exports = {
  product,
  productCard,
  category,
  brand,
  collection,
  review,
  post,
  faq,
  testimonial,
  shippingOption,
  coupon,
  banner,
  navMenu,
  order,
  customer,
  settings,
  badgesFor,
  iso,
  idOf,
};
