# LUMO — Domain Contract

Single source of truth shared by **ecommerce-backend**, **Toys-Admin** and **Toys-Website**.

The storefront already declares its domain in Zod at
`Toys-Website/src/data/schemas/index.ts`. That file is the **authority on shape**.
This document maps it onto MongoDB and records the decisions that Zod cannot express.

---

## Global conventions

| Rule | Detail |
| --- | --- |
| **Money** | Integer **minor units** (pence). Never a float, never a `Decimal128`. `price: 2495` is £24.95. Enforced with `validate: Number.isInteger`. |
| **Currency** | `"GBP"` literal for now. Settings owns the display symbol. |
| **`id` not `_id`** | Every model applies a `toJSON` transform: `_id` → `id` (string), drop `__v`. The storefront's Zod expects `id: string`. |
| **Referencing** | Relations are stored as **ObjectId refs** (integrity, cascade checks) but **serialised as slugs** (`brandSlug`, `categorySlugs[]`, `collectionSlugs[]`) because that is what the storefront's Zod contract and URLs use. Controllers populate then project. |
| **Slugs** | Unique, immutable-by-default, lowercase kebab. Auto-derived from `name` on create, editable in admin with a uniqueness check. |
| **Tone** | `coral \| sunny \| sky \| mint \| grape \| bubble`. Shared enum — the storefront's "toy box" families. Categories, brands, collections and blog posts each carry one. |
| **Soft delete** | Catalogue entities use `status` / `isActive` rather than hard delete, so an order's historical line items never dangle. Hard delete is admin-only and blocked when referenced. |
| **Timestamps** | `timestamps: true` everywhere. `createdAt` is also a storefront sort key ("Newest first"). |

### Response envelope

```jsonc
// success
{ "success": true, "data": <payload>, "meta": { "page": 1, "pages": 9, "total": 214, "limit": 24 } }
// error
{ "success": false, "error": { "message": "...", "code": "VALIDATION_ERROR", "details": [ ... ] } }
```

`meta` is present only on list endpoints. `facets` rides alongside `meta` on product lists.

---

## Derived vs authored fields

This is the part that keeps admin and storefront honest. **Derived fields are never
writable through the API** — the admin panel shows them read-only.

| Field | Derivation | Recomputed when |
| --- | --- | --- |
| `product.rating.{average,count,distribution}` | Aggregate over **approved** reviews only | Review created / approved / rejected / deleted |
| `product.stock.status` | `preOrder` → `pre-order`; `qty === 0` → `sold-out`; `qty <= lowStockThreshold` → `low-stock`; else `in-stock` | Any stock write, order placement |
| `product.popularity` | Rolling score from order line quantity + views | Order paid; nightly recompute |
| `product.badges[]` | Union of **authored** badges (`limited`, `exclusive`, `eco`, `award`) and **derived** ones (`new` ≤30d, `bestseller` by popularity rank, `sale` when `compareAtPrice > price`) | On read/save |
| `order.totals.*` | Recomputed server-side from line items + shipping + coupon. **Client totals are never trusted.** | Order create/update |

`isFeatured`, `isTrending`, `isNewArrival` and `isBestSeller` are **authored booleans**
the admin sets explicitly — they drive the `/featured`, `/new-arrivals` and
`/best-sellers` routes and must be overridable regardless of what the derivation says.

---

## Models

### 1. Product
Backs `Product` in the storefront Zod. Full field list lives in `models/Product.js`.

Notable departures from the Zod contract, all **additive** (Zod stays satisfied):

- **`images[]`** — Zod has `{ seed, alt, type }`. Extended to `{ url, seed, alt, type, sortOrder }`.
  `url` is the uploaded file; `seed` is retained as the deterministic-gradient fallback so a
  product created with no photography still renders (see
  `Toys-Website/src/components/common/product-image.tsx`). `seed` auto-fills from the slug.
- **`sku`** — top-level SKU added; variants keep their own.
- **`seo`** — `{ title, description, keywords[], ogImage }`, new. Not in the storefront Zod
  because static metadata was hardcoded per route.
- **`status`** — `draft | active | archived`. Only `active` is served to the storefront.
- **`lowStockThreshold`** — drives the derived `stock.status`.

`variants[].kind` is `colour | size | edition` with an optional hex `swatch` —
**not** the old project's `{size, color}` pair, which cannot express an edition variant.

### 2. Category
Storefront `Category` + admin's parent/child requirement.
- `parent: ObjectId | null` — self-referencing, max depth 2 (validated).
- `kind: age | type | interest` — retained; it drives the mega-menu columns.
- `ageRange: { min, max } | null` — only meaningful when `kind === "age"`.
- Adds `image`, `icon`, `sortOrder`, `isActive`, `seo`.

### 3. Brand
Storefront `Brand` (`slug, name, blurb, story, origin, founded, tone`)
plus `logo`, `sortOrder`, `isActive`, `seo`.

### 4. Collection
Storefront `Collection` including `chapters[] { heading, body }` (the scroll-told story),
plus `heroImage`, `sortOrder`, `isActive`, `seo`.

### 5. Review
Storefront `Review` plus the moderation field the admin panel needs:
- `status: pending | approved | rejected` — **only `approved` reaches the storefront.**
- `product: ObjectId` (serialised as `productId`), `user: ObjectId | null` for guest reviews.
- Approving/rejecting triggers the `product.rating` recompute. This is what makes
  "review approval immediately affects what users see" true.

### 6–8. BlogPost · Faq · Testimonial
Mirror the Zod shapes in `content.ts`. Each gains `status`/`isPublished` and `sortOrder`.
`BlogPost.body` stays `string[]` (paragraph array), matching the storefront renderer.

### 9. Coupon
Storefront `Coupon` (`code, kind, value, description, minSpend`) plus real commerce fields:
`isActive`, `validFrom`, `validUntil`, `usageLimit`, `usageCount`, `perUserLimit`.
`kind: percent | fixed | free-shipping`.

### 10. ShippingOption
Storefront `ShippingOption` plus `isActive`, `sortOrder`.
`FREE_SHIPPING_THRESHOLD` (currently 5000) moves into **Settings**, not a constant.

### 11. Order
Rebuilt for this storefront's checkout.
- `orderNumber` — human-readable, unique.
- `items[]` — **snapshot** of name/slug/price/image/variant at purchase time, plus a
  `product` ref. A later price edit must never rewrite order history.
- `totals: { subtotal, discount, shipping, tax, grandTotal }` — all minor units, all
  server-computed.
- `status: pending | paid | processing | shipped | delivered | cancelled | refunded`
- `shipping: { option, address, trackingNumber, carrier, shippedAt, deliveredAt }`
- `coupon: { code, kind, value, discountApplied }` snapshot.
- `payment: { method, status, reference }`.

### 12. User
- `role: ObjectId → Role` (see below). Customers get the seeded `customer` role.
- `addresses[]`, `wishlist[]` (product refs), `password` (bcrypt, `select: false`).
- Storefront account pages read `/me`; admin reads the customer list + order history.

### 13. Role
Explicit model rather than an enum string, because "Roles & Permissions" is a
management screen in the requirements.
- `name`, `slug`, `permissions: string[]` using `resource:action`
  (`product:create`, `order:update`, `settings:manage`, …), `isSystem` (undeletable).
- Seeded: `super-admin` (all), `admin`, `staff` (catalogue + orders, no settings/roles),
  `customer` (storefront only).

### 14. Banner
Announcement-bar strings and promotional banners in one model, discriminated by
`placement: announcement | hero | promo-strip | category-header`.
Fields: `title`, `subtitle`, `image`, `href`, `tone`, `isActive`, `startsAt`, `endsAt`, `sortOrder`.
The rotating `ANNOUNCEMENTS` array becomes `placement: "announcement"` rows.

### 15. HomeSection
Drives the homepage. `type` discriminates:
`hero | collection-tiles | product-rail | promo | testimonials | newsletter | rich-text`.
- `sortOrder` controls the page order; `isActive` toggles a section off.
- `config` is a type-specific subdocument — e.g. a `product-rail` holds
  `{ source: "featured" | "new-arrivals" | "best-sellers" | "manual", productIds[], limit }`.

This is what makes the homepage genuinely admin-managed rather than a fixed layout
with swappable content.

### 16. NavMenu
Replaces `src/data/config/nav.ts`.
`location: primary | shop-mega | collections-panel | footer`, with nested
`columns[] { title, tone, links[] { label, href, note } }` and `sortOrder`.
Footer columns and the mega-menu columns share this model.

### 17. Settings
**Singleton** (enforced — one document, fetched by a fixed key).
`site { name, tagline, logo, favicon }`, `contact { email, phone, address }`,
`social[] { platform, url }`, `footer { blurb, copyright, columns→NavMenu }`,
`seo { defaultTitle, titleTemplate, defaultDescription, ogImage, robots }`,
`commerce { currency, freeShippingThreshold, taxRate }`.

### 18. Wishlist
Retained from the existing backend but re-pointed at the new Product model.
Storefront has `/wishlist` and `/account/wishlist` routes.

---

## Endpoint map

Public (storefront, no auth) — `/api/v1/*`:

```
GET  /products                 list + filter + sort + paginate + facets
GET  /products/:slug           single, populated
GET  /products/:slug/reviews    approved only
GET  /products/:slug/recommendations
GET  /categories | /categories/:slug
GET  /brands     | /brands/:slug
GET  /collections| /collections/:slug
GET  /reviews                  approved, cross-product (the /reviews page)
GET  /posts      | /posts/:slug
GET  /faqs  /testimonials  /shipping-options  /banners  /home-sections  /nav  /settings
POST /reviews                  customer-submitted → status: pending
POST /coupons/validate
POST /orders                   checkout
GET  /orders/track/:orderNumber
POST /search/suggestions
```

Auth — `/api/v1/auth/*`: `register, login, me, refresh, forgot-password, reset-password, verify-otp`.

Admin (JWT + permission-gated) — `/api/v1/admin/*`: full CRUD for every model above,
plus `/admin/analytics/{overview,sales,orders,customers,products}` and
`/admin/uploads` (multipart).

### Product list query contract

Mirrors `Toys-Website/src/lib/catalogue.ts` exactly so the storefront's existing
query layer maps 1:1 onto the API:

```
?category=a,b &brand=x &collection=y &min= &max= &rating= &ageMin= &ageMax=
&badge= &inStock=true &q= &sort= &page= &limit=
sort ∈ popular | new | price-asc | price-desc | rating | name-asc | age-asc | discount
```

Facets are returned for `categories`, `brands`, `badges`, `priceMin`, `priceMax`, and —
matching the existing implementation — **each facet ignores its own dimension**, so
ticking one category does not zero the other category counts.

---

## What is deliberately NOT in the database

- **Cart** — client-side (`src/stores/cart.ts`, zustand + localStorage). Only becomes an
  Order at checkout. Server recomputes all totals from product IDs at that point.
- **Route constants** (`src/constants/routes.ts`) — these are code paths, not content.
  NavMenu stores `href` strings that point at them.
- **Design tokens** — `tokens.css` is code. Admin theming is out of scope.
