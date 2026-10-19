# SA Toys — Backend API (`SAToys-Backend`) — Full Project Context

> One-file knowledge base for this repository. Written so a developer or an AI
> agent can understand the whole backend without reading every file first.
> Generated from the code as of commit `f3db885` (2026-09-02). When the code and
> this file disagree, **the code wins** — update this file.

---

## 1. What this is

The REST API for **SA Toys** (formerly branded **LUMO**; the package name is still
`lumo-backend`). It is an e-commerce toy store based in **Pakistan** (currency
**PKR**, cash-on-delivery only).

It serves two browser clients that live in separate repos:

| Client | Repo (local path) | Default dev URL | Talks to the API via |
|---|---|---|---|
| Storefront (customer site) | `Toys-Web` (`/Users/digitalgravity/Documents/Projects/Toys-Web`) | `http://localhost:3000` | Server components (`API_URL`) + Next route handlers that proxy browser writes |
| Admin panel | `SAToys-Admin` (`/Users/digitalgravity/Documents/Projects/SAToys-Admin`) | `http://localhost:3001` | Browser `fetch` with Bearer JWT (`NEXT_PUBLIC_API_URL`) |

Production domains (from `.env.example`): storefront `https://www.satoys.store`,
admin `https://admin.satoys.store`, API `https://api.satoys.store`.

History: the repo started as a generic e-commerce backend (Stripe, Nodemailer,
size/colour variants). Commit `4533908` "Repurpose backend for LUMO toy store"
rewrote it. **`README.md` and `ENV_SETUP.md` still describe the old generic backend
(Stripe, `/api/products`, `/api/wishlist`, SMTP) and are stale — do not trust them.**
`DEPLOY.md` and `STORAGE.md` are current (rewritten 2026-10-19); `DOMAIN.md` is current-ish (see §15 for the parts of
`DOMAIN.md` that drifted).

---

## 2. Tech stack

- **Node.js ≥ 20**, CommonJS (`"type": "commonjs"`)
- **Express 5** (`express@^5.2.1`) — note `req.query` is a getter (see §7.4)
- **MongoDB** via **Mongoose 9** (`strictQuery: true`)
- **Zod 4** for request validation (`z.email()`, `z.url()` top-level helpers)
- **jsonwebtoken** (JWT, Bearer), **bcryptjs** (cost 12)
- **helmet**, **cors** (allow-list), **compression**, **morgan**, **express-rate-limit 8**
- **multer 2** (memory storage) for uploads
- **sanitize-html** for the rich-text product description
- **slugify**
- **swagger-ui-express** — hand-written OpenAPI spec at `/api/docs`
- Email: **Brevo transactional HTTP API** via global `fetch` (no SMTP, no nodemailer)
- Dev: **nodemon**
- No test framework; there is an end-to-end smoke script (`npm run smoke`).
- No cookie-parser installed (see §15).

---

## 3. Scripts

```bash
npm run dev            # nodemon server.js
npm start              # node server.js
npm run seed:roles     # src/scripts/seedRoles.js — REQUIRED once on a new DB
npm run create-admin   # src/scripts/createAdmin.js — first super-admin
npm run smoke          # src/scripts/smoke.js — E2E checks against a running server
npm run migrate:media  # src/scripts/migrateMedia.js — ./uploads → STORAGE_DRIVER (--dry-run, --only=<collection>; --from=firebase is retired)
npm run migrate:images # same script with --from=local (./uploads → STORAGE_DRIVER)
npm run media:check    # end-to-end check of the Hostinger storage driver
```

First-time setup on a fresh database:

1. `cp .env.example .env` and fill `MONGODB_URI`, `JWT_SECRET` (≥ 32 chars).
2. `npm install`
3. `npm run seed:roles` — creates the 4 system roles, the Settings singleton and
   empty NavMenu docs for `primary`, `shop-mega`, `collections-panel`, `footer`.
   Idempotent. **Without it, `/auth/register` throws "The customer role is missing".**
4. `npm run create-admin` — prompts for first name/email/password, or reads
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` env vars. If the email exists it is
   promoted to super-admin and its password reset.
5. `npm run dev` → `http://localhost:5000` (docs at `/api/docs`).

The catalogue starts **empty** by design — there is no content seed.

---

## 4. Directory layout

```
server.js                    boot: load env → connect Mongo → listen; graceful shutdown
DOMAIN.md  DEPLOY.md  STORAGE.md   design docs (DOMAIN partially stale)
README.md  ENV_SETUP.md      STALE — describe the pre-repurpose generic backend
src/
  app.js                     express app: helmet, cors, compression, json, morgan, rate limit, /uploads, /api/health, /api/v1, docs, 404, error handler
  config/
    env.js                   env parsing + fail-fast
    database.js              mongoose.connect (strictQuery, 10s server selection)
    constants.js             all shared enums (mirror the storefront Zod)
    permissions.js           RESOURCES × ACTIONS, SUPER '*', SYSTEM_ROLES
  routes/
    index.js                 mounts /auth, /account, /admin, then / (public) last
    auth.js  account.js  admin.js  public.js
  controllers/
    crudFactory.js           generic list/getOne/create/update/remove/reorder
    productController.js     public listing/detail/recs/suggestions + admin product/inventory
    taxonomyController.js    categories/brands/collections (factory + public reads)
    reviewController.js      public submit/list/helpful + admin moderation
    contentController.js     posts, faqs, testimonials, banners, home sections, coupons, shipping, contact
    storefrontController.js  /bootstrap /home /nav /settings, coupon validate, shipping estimate, admin nav/settings
    orderController.js       quote, checkout, track, my orders, admin orders/status/payment/shipping/invoice
    userController.js        account profile/addresses/wishlist, admin customers/staff/roles/permissions
    authController.js        register/login/adminLogin/me/forgot/reset/send-otp/verify-otp/change-password
    uploadController.js      upload one/many/video, list, delete
    analyticsController.js   overview/sales/products/customers/orders
  middleware/
    auth.js                  protect, optionalAuth, requirePermission, requireStaff, holds
    validate.js              Zod → req.body / req.params / req.validatedQuery
    upload.js                multer instances (images, video)
    errorHandler.js          maps Mongoose/Mongo/JWT/Multer/Zod errors → envelope
    notFound.js
  models/                    18 Mongoose models + shared.js subdocs + plugins/serialise.js
  services/
    catalogue.js             product filter/sort/facets/recommendations
    pricing.js               priceLines, applyCoupon, resolveShipping, computeTotals
    rating.js                recomputeProductRating
    revalidate.js            fire-and-forget POST to storefront /api/revalidate
    serialisers.js           DB doc → storefront contract shapes
    storage/{index,local,hostinger,hostinger-http}.js
  validators/                Zod schemas: common, auth, catalogue, commerce, content, review
  utils/                     ApiError, asyncHandler, respond, query, slug, logger, sendEmail, generateToken, generateOTP
  docs/{mount,openapi}.js    /api/openapi.json and Swagger UI at /api/docs
  scripts/                   seedRoles, createAdmin, smoke, migrateMedia, mediaCheck
uploads/                     (runtime, local driver only; gitignored)
```

---

## 5. Environment variables (`src/config/env.js`)

Required (process exits otherwise): `MONGODB_URI`, `JWT_SECRET` (must be ≥ 32 chars).

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | `development` | `production` enables `trust proxy`, JSON logs, hides stacks |
| `PUBLIC_URL` | `http://localhost:${PORT}` | Base for local-driver upload URLs |
| `MONGODB_URI` | — | Mongo connection |
| `JWT_SECRET` / `JWT_EXPIRE` | — / `7d` | Token signing |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3001` | Comma-separated browser allow-list |
| `STOREFRONT_URL` | `http://localhost:3000` | Links in emails (reset password, review prompts) |
| `ADMIN_URL` | `http://localhost:3001` | Reset link when `context: 'admin'` |
| `UPLOAD_MAX_FILE_SIZE_MB` | `5` | Per-image limit |
| `UPLOAD_MAX_FILES` | `12` | Per batch |
| `UPLOAD_MAX_VIDEO_SIZE_MB` | `50` | Video limit |
| `STORAGE_DRIVER` | `local` | `local`, `hostinger` (production) or `hostinger-http` |
| `MEDIA_ROOT` | — | `hostinger`: absolute path of media.satoys.store's `public_html` |
| `MEDIA_PUBLIC_URL` | — | Public base of the media site (`https://media.satoys.store`) |
| `MEDIA_UPLOAD_URL`, `MEDIA_UPLOAD_SECRET` | — | `hostinger-http` only: PHP receiver URL and HMAC secret |
| `STOREFRONT_REVALIDATE_URL`, `REVALIDATE_SECRET` | — | Both needed for cache-invalidation webhook |
| `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS` | — | Both needed → `mail.enabled` |
| `EMAIL_FROM_NAME` | `SA Toys` | Sender name |
| `LOG_LEVEL` | info (prod) / debug (dev) | `error|warn|info|debug`; `debug` also enables mongoose debug in dev |

Email uses Brevo's HTTP API: the code reads `BREVO_API_KEY` + `EMAIL_FROM_ADDRESS`
(the old SMTP `EMAIL_HOST/PORT/USER/PASS` keys are unused).

---

## 6. HTTP surface overview

- `GET /api/health` → `{ success, data: { status:'ok', uptime, time } }` (not logged by morgan)
- `GET /api/openapi.json`, `GET /api/docs` (Swagger UI, hand-maintained spec in `src/docs/openapi.js`)
- `/uploads/*` static (local driver only; 30d immutable cache in prod; `nosniff`)
- Everything else under **`/api/v1`**.

### 6.1 Global middleware order (`src/app.js`)

1. `trust proxy` (prod only)
2. `helmet` — CSP off, `crossOriginResourcePolicy: cross-origin` (images embedded by other origins)
3. `cors` — allow-list; requests with no `Origin` allowed; unknown origins silently refused (no throw); `credentials: true`
4. `compression`
5. `express.json` / `urlencoded` — 2 MB limit
6. `morgan` → logger (`combined` in prod, `dev` otherwise)
7. Rate limit on `/api`: **300 req/min/IP**
8. `/uploads` static (local driver) or the driver's `init()` (a misconfigured driver is logged; the API still boots, uploads fail)
9. `/api/health`, `/api/v1` routes, docs, `notFound`, `errorHandler`

### 6.2 Response envelope (`src/utils/respond.js`)

```jsonc
// ok / created
{ "success": true, "data": <payload> }
// paginated list
{ "success": true, "data": [...], "meta": { "total", "page", "pages", "limit" }, /* extras e.g. facets, summary */ }
// 204 for deletes (no body)
// error
{ "success": false, "error": { "message", "code", "details"?: [{ field, message }], "stack"?: "dev only" } }
```

Error codes: `BAD_REQUEST 400`, `UNAUTHENTICATED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`,
`NO_ROUTE 404`, `INVALID_ID 400` (CastError), `CONFLICT 409` (incl. Mongo 11000 —
"That {field} is already taken"), `VALIDATION_ERROR 422` (Zod + Mongoose),
`RATE_LIMITED 429`, `MAIL_NOT_CONFIGURED 503`, `MAIL_SEND_FAILED 502`, `INTERNAL_ERROR 500`.
Multer errors become 400 ("File is too large", "Too many files", …).

---

## 7. Routes — complete list

Mount order in `routes/index.js`: `/auth`, `/account`, `/admin`, then public `/` last
(public has loose `/:slug` patterns).

### 7.1 Auth — `/api/v1/auth` (`routes/auth.js`)

All credential routes use a **strict limiter: 10 requests / 15 min / IP**.

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/register` | `{firstName, lastName?, email, phone?, password(≥8)}` | Always assigns `customer` role. Returns `{token, user}` (201) |
| POST | `/login` | `{email, password}` | Same message for unknown email / wrong password. Updates `lastLoginAt` |
| POST | `/admin/login` | `{email, password}` | Same as login but 403 if role has no permissions |
| POST | `/forgot-password` | `{email}` (+ optional `context:'admin'`, but the Zod schema strips it — see §15) | Always generic response. Token TTL 30 min; link `${base}/reset-password?token=` |
| POST | `/reset-password` | `{token, password}` | Returns new session |
| POST | `/send-otp` | `{email}` | **Passwordless sign-in.** Creates a customer user if email unknown. 6-digit code, 10 min TTL. In prod without mail config → 503; send failure → 502. Dev without mail → code logged |
| POST | `/verify-otp` | `{email, code(6 digits)}` | Max 5 attempts; sets `isEmailVerified`; returns `{token, user}` |
| GET | `/me` | — | `protect`; returns `S.customer(user)` |
| POST | `/change-password` | `{currentPassword, newPassword}` | `protect` |

Session payload: `{ token: <JWT {id}>, user: S.customer(user) }` where user includes
`role: { id, name, slug, permissions }`.

### 7.2 Account — `/api/v1/account` (all `protect`)

| Method | Path | Notes |
|---|---|---|
| PATCH | `/profile` | `{firstName?, lastName?, phone?}` |
| GET | `/addresses` | returns `user.addresses` |
| POST | `/addresses` | address body; `isDefault:true` clears other defaults; returns full list (201) |
| PATCH | `/addresses/:addressId` | partial address |
| DELETE | `/addresses/:addressId` | returns remaining list |
| GET | `/wishlist` | active products only, as product cards |
| POST | `/wishlist/:productId` | `$addToSet` |
| DELETE | `/wishlist/:productId` | `$pull` |
| GET | `/orders` | paginated (default 10); matches `user == me` **OR** `email == my email` (claims guest orders) |
| GET | `/orders/:id` | same ownership rule |

### 7.3 Public storefront — `/api/v1`

| Method | Path | Notes |
|---|---|---|
| GET | `/bootstrap` | `{ nav:{primary, shopMega, collectionsPanel, footer}, settings, announcements: string[] }` (live `announcement` banners' titles) |
| GET | `/home` | Ordered active HomeSections, each resolved (`product-rail` → `products[]` cards, `collection-tiles` → `collections[]`, `hero` → `showCanvas`) |
| GET | `/nav` | Same nav object as bootstrap |
| GET | `/settings` | `S.settings` |
| GET | `/products` | `productQuery` (see §9.1). Paginated + `facets` unless `facets=false` |
| GET | `/products/slugs` | `[{slug, updatedAt}]` of active products (sitemap). Declared before `/:slug` |
| GET | `/products/:slug` | Full product; fire-and-forget `viewCount++` |
| GET | `/products/:slug/recommendations` | `{completesTheSet, othersAlsoLoved, moreFromBrand, youMightAlsoLike}` |
| GET | `/products/:slug/reviews` | Approved only; `sort=recent|helpful|rating` (default helpful), `rating`, page/limit (12) |
| GET | `/categories` | Active tree (roots with `children[]`) |
| GET | `/categories/:slug` | With `children[]` |
| GET | `/brands`, `/brands/:slug` | Active only |
| GET | `/collections`, `/collections/:slug` | Active only; `?seasonal=` filter (read from raw query) |
| GET | `/search/suggestions?q=` | ≤ 8 `{id,name,slug,price,image,seed}`, regex on name/tags |
| GET | `/reviews` | Approved cross-product; default sort recent; `?summary=true` adds `summary:{total, average, distribution}` beside `meta` |
| POST | `/reviews` | `optionalAuth`; always `pending`; `verified` = an order with that email+product in `shipped`/`delivered` |
| POST | `/reviews/:id/helpful` | increments `helpful` on approved review |
| GET | `/posts` (paginated, `?topic=`), `/posts/:slug` | Published only |
| GET | `/faqs`, `/testimonials`, `/shipping-options` | Published/active |
| GET | `/banners?placement=` | Live now (`isActive` + inside `startsAt/endsAt`) |
| POST | `/contact` | Limiter **5 / 15 min / IP**. `{name, email, subject?, message(≥10)}` |
| POST | `/coupons/validate` | `optionalAuth`; `{code, subtotal}` → `{valid, code, discount, freeShipping, description}`; invalid → 400 with reason |
| POST | `/shipping/estimate` | `{subtotal, postcode?}` → `{options[+effectivePrice], freeShippingThreshold, qualifiesForFree, remainingForFree}` |
| POST | `/orders/quote` | `optionalAuth`; `{items, shippingOptionKey?, couponCode?}` → priced items + totals + `freeShippingThreshold`, `freeShippingReason` |
| POST | `/orders` | `optionalAuth`; checkout (see §10) |
| GET | `/orders/track/:orderNumber` | Limiter **10 / 15 min / IP**. **No email check** — order number alone (uppercased) |

### 7.4 Admin — `/api/v1/admin` (all `protect` + `requireStaff`, then per-route `requirePermission`)

`mountCrud(path, resource, crud, {create, update})` produces for each resource:

```
GET    {path}            {res}:read    ?q, sort, status, isActive, page, limit(≤100, default 25)
POST   {path}/reorder    {res}:update  { items: [{ id, sortOrder }] }   (bulkWrite)
GET    {path}/:id        {res}:read
POST   {path}            {res}:create
PATCH  {path}/:id        {res}:update  (assign + save → hooks run)
DELETE {path}/:id        {res}:delete  (204; beforeDelete guards)
```

Mounted with `mountCrud`: `/categories` (category), `/brands` (brand),
`/collections` (collection), `/posts` (post), `/faqs` (faq), `/testimonials`
(testimonial), `/banners` (banner), `/home-sections` (home), `/coupons` (coupon),
`/shipping-options` (shipping).

Hand-wired admin routes:

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/analytics/overview` | analytics:read | `?from&to` (default last 30 days) |
| GET | `/analytics/sales` | analytics:read | daily series, gaps filled |
| GET | `/analytics/products` | analytics:read | `topSellers`, `byCategory` |
| GET | `/analytics/customers` | analytics:read | `topCustomers`, `repeatRate`… |
| GET | `/analytics/orders` | analytics:read | counts by fulfillment status |
| GET | `/products` | product:read | `?status, q, lowStock, sort=newest|oldest|name-asc|price-asc|price-desc|stock` |
| GET | `/products/:id` | product:read | raw doc; refs as id strings |
| POST | `/products` | product:create | Zod `createProduct` |
| PATCH | `/products/:id` | product:update | Zod `updateProduct` (partial) |
| DELETE | `/products/:id` | product:delete | 409 if in any order (archive instead); deletes reviews, pulls from related/bundle |
| PATCH | `/products/:id/stock` | inventory:update | `{quantity?, lowStockThreshold?, preOrder?, restockDate?, trackInventory?, variants?:[{id,stock}]}` |
| POST | `/products/bulk` | product:update | `{ids, set}`; allowed keys `status,isFeatured,isTrending,isNewArrival,isBestSeller` (no Zod) |
| GET | `/inventory` | inventory:read | tracked products, low first; `?lowOnly, q`; default limit 50 |
| GET | `/reviews` | review:read | `?status, rating, productId` |
| GET | `/reviews/stats` | review:read | `{pending, approved, rejected}` |
| PATCH | `/reviews/:id` | review:update | `{status, moderationNote?}` → recompute rating |
| POST | `/reviews/bulk` | review:update | `{ids, status}` (no Zod) |
| DELETE | `/reviews/:id` | review:delete | recompute rating |
| GET | `/contact-messages`, `/contact-messages/:id` | contact:read | |
| PATCH | `/contact-messages/:id` | contact:update | `{status: new|read|archived}` |
| DELETE | `/contact-messages/:id` | contact:delete | |
| GET / PUT | `/nav/:location` | nav:read / nav:update | PUT is an upsert `{columns?, links?}` |
| GET / PATCH | `/settings` | settings:read / settings:update | PATCH merges per block |
| GET | `/orders` | order:read | `?status, paymentStatus, q (orderNumber/email/lastName), from, to` → summary rows |
| GET | `/orders/:id` | order:read | full order incl. `internalNote`, `billingAddress` |
| GET | `/orders/:id/invoice` | order:read | `{order, issuer, invoiceNumber: 'INV-'+orderNumber, issuedAt, currencySymbol}` |
| PATCH | `/orders/:id/status` | order:update | `{status, note?}` fulfillment transition + email |
| PATCH | `/orders/:id/payment` | order:update | `{status: paid|cancelled, note?}`; cancel restocks + email |
| PATCH | `/orders/:id/shipping` | order:update | `{trackingNumber?, carrier?, address?}` |
| GET | `/customers` | customer:read | `?q, isActive, role, staff=true|false`; adds `orderCount`, `totalSpent` |
| GET | `/customers/:id` | customer:read | + last 50 orders + stats |
| POST | `/customers` | customer:create | create staff `{firstName, lastName?, email, phone?, password, role}` |
| PATCH | `/customers/:id` | customer:update | `{firstName?, lastName?, phone?, role?, isActive?}`; can't deactivate/re-role yourself |
| DELETE | `/customers/:id` | customer:delete | can't delete yourself; users with orders are **deactivated** instead |
| GET | `/permissions` | role:read | `{resources, actions}` |
| GET / POST | `/roles` | role:read / role:create | list includes `userCount` |
| PATCH / DELETE | `/roles/:id` | role:update / role:delete | system roles: permissions immutable, undeletable; in-use roles undeletable |
| GET | `/uploads/:folder` | upload:read | media listing newest first |
| POST | `/uploads/:folder` | upload:create | multipart field **`file`** (image) |
| POST | `/uploads/:folder/video` | upload:create | multipart field **`file`** (mp4/webm/quicktime ≤ 50 MB) |
| POST | `/uploads/:folder/batch` | upload:create | multipart field **`files`** (≤ 12) |
| DELETE | `/uploads/:folder/:filename` | upload:delete | |

Upload folders (whitelist): `products, categories, brands, collections, banners, misc`
(unknown → `misc` on upload, 400 on list/delete). Upload response:
`{url, path, filename, originalName, size, mimeType}`. Filenames are always
regenerated as `${Date.now()}-${12 hex}${ext}`. Accepted images: jpeg, png, webp, avif, gif, svg+xml.

---

## 8. Auth & RBAC

- JWT payload `{ id }`, signed via `utils/generateToken` (reads `config/env`, never raw `process.env`).
- `readToken`: `Authorization: Bearer <token>`; falls back to `req.cookies.token` but
  **no cookie parser is installed**, so only Bearer works in practice.
- `protect` → loads user + populates `role`; 401 if missing/invalid, 403 if `isActive=false`.
- `optionalAuth` → same but never rejects (bad token = anonymous).
- `requireStaff` → role has ≥ 1 permission.
- `requirePermission(...perms)` → needs **all**; `'*'` grants everything.
- Permissions are `resource:action` strings. Resources (21): `product, category, brand,
  collection, review, post, faq, contact, testimonial, coupon, shipping, banner, home,
  nav, order, customer, inventory, settings, role, upload, analytics`. Actions:
  `create, read, update, delete`. Role model validates every string.

System roles (seeded, `isSystem: true`):

| slug | Permissions |
|---|---|
| `super-admin` | `['*']` |
| `admin` | CRUD on catalogue (product, category, brand, collection, inventory) + content (post, faq, testimonial, banner, home, nav) + review, coupon, shipping, order, customer; `contact:read/update/delete`; `upload:create/delete/read`; `analytics:read`; `settings:read/update` (no `role:*`) |
| `staff` | CRUD product + inventory; read category/brand/collection/customer; `review:read/update`; `order:read/update`; `contact:read/update`; `upload:create/read`; `analytics:read` |
| `customer` | `[]` (no admin access) |

Customers and staff share the **User** collection; the difference is only the role.

---

## 9. Catalogue logic (`services/catalogue.js`)

Ported from the storefront's original in-memory `lib/catalogue.ts`, so URL query
semantics match.

### 9.1 Product query (`validators/common.js → productQuery`)

| Param | Type | Behaviour |
|---|---|---|
| `category`, `brand`, `collection` | csv of **slugs** | resolved to ObjectIds; unknown slug ⇒ empty result |
| `min`, `max` | int (minor units) | price range |
| `rating` | number | `rating.average ≥` |
| `ageMin`, `ageMax` | int | **overlap** test with product `ageRange` |
| `badge` | csv | `sale` ⇒ `compareAtPrice > price`; `bestseller` ⇒ `isBestSeller`; `new` ⇒ `isNewArrival` or published ≤ 30 days; others match stored `badges` |
| `inStock` | bool | `stock.status != sold-out` |
| `featured`, `trending`, `newArrival`, `bestSeller` | bool | authored flags |
| `q` | string ≤ 120 | case-insensitive escaped regex on name/tagline/tags/sku (not `$text`) |
| `sort` | `popular`(default) `new` `price-asc` `price-desc` `rating` `name-asc` `age-asc` `discount` | `discount` uses an aggregation computing `(compareAt-price)/compareAt` |
| `facets` | bool | `false` skips facet aggregations |
| `page`, `limit` | int | default 1 / 24, max 100 |

Public visibility: **only `status: 'active'` products**.

Facets: `{ categories:{slug:n}, brands:{slug:n}, badges:{slug:n}, priceMin, priceMax }`.
Each facet is counted **ignoring its own dimension** (so selecting one category still
shows counts for others).

### 9.2 Recommendations

- `completesTheSet` — `bundle[]` refs
- `othersAlsoLoved` — `related[]` refs
- `moreFromBrand` — same brand, by popularity, ≤ 8
- `youMightAlsoLike` — price ± 2500 minor units and overlapping age range, by rating, ≤ 8

### 9.3 Derived product fields (never writable via API)

- `stock.status` — `refreshStockStatus()` on every save: `preOrder` → `pre-order`;
  `!trackInventory` → `in-stock`; `qty ≤ 0` → `sold-out`; `qty ≤ lowStockThreshold` → `low-stock`; else `in-stock`.
- `rating.{average,count,distribution[5]}` — recomputed from **approved** reviews on
  approve/reject/delete/bulk moderate (`services/rating.js`).
- `badges` on read — authored (`limited, exclusive, eco, award`) ∪ derived
  (`new` if `isNewArrival` or published/created < 30 days, `bestseller` if
  `isBestSeller`, `sale` if `compareAtPrice > price`).
- `popularity` — `+2 × quantity` per order line; `salesCount += qty`; `viewCount++` per detail view.
- `compareAtPrice ≤ price` is nulled on save; `publishedAt` set when first `active`.
- Product `description` is HTML from the admin rich-text editor; sanitised to
  `p, strong, em, b, i, ul, ol, li, blockquote, br` with **no attributes**.

---

## 10. Commerce / pricing / orders

All money is **integer minor units** (paisa; code comments still say "pence").
`shared.money()` validator rejects non-integers. Currency default `PKR`, symbol `Rs`.

### 10.1 `services/pricing.js`

- `priceLines(lines)` — reloads active products, validates variant exists, checks stock
  (unless `!trackInventory` or `preOrder`) → 409 "Only N left of X" / "X has sold out";
  snapshots `{product, name, slug, sku, image, imageSeed, variantId, variantLabel, unitPrice (price+priceDelta), quantity, lineTotal}`.
- `applyCoupon(code, subtotal, {userId})` — not found / inactive / not started / expired /
  fully redeemed / below `minSpend` / `perUserLimit` reached → 400 with reason.
  `percent` → `round(subtotal × value / 100)`; `fixed` → `min(value, subtotal)`;
  `free-shipping` → `freeShipping: true`.
- `resolveShipping(optionKey, …)` — option must be active. Free if coupon is
  free-shipping or `subtotalAfterDiscount ≥ settings.commerce.freeShippingThreshold`
  (default 5000). "Free" only zeroes **standard** (key `standard`); faster options cost
  `price − standard.price`.
- `computeTotals` — `subtotal`, `discount`, `shipping`, `tax`, `grandTotal`. Tax from
  `settings.commerce.taxRateBps` (default 0). If `pricesIncludeTax` (default true) tax is
  extracted for display and not added.

### 10.2 Checkout `POST /orders` (`orderController.create`)

Body (`validators/commerce.createOrder`): `{ email, phone?, items:[{productId, variantId?, quantity 1–99}], shippingAddress, billingAddress?, shippingOptionKey, paymentMethod:'cod' (only option), couponCode?, giftWrap?, giftNote?, customerNote? }`.
**Client prices/totals are never accepted.**

Flow: price lines → compute totals → build Order (`payment: {method:'cod', status:'unpaid'}`,
`status:'pending'`) → in a **Mongo transaction** decrement stock (conditional
`$inc` with `stock ≥ qty` filter; variant stock and product stock both decremented) and
save. On a standalone mongod (no replica set) it falls back to non-transactional
conditional updates. Then coupon `usageCount++`, product `salesCount/popularity`, and a
fire-and-forget confirmation email. Response: `S.order(doc)` + `_transactional: bool`.

Order number: `SATOYS-<base36 day number>-<6 random base36>` (older orders keep `LUMO-…`).

### 10.3 Order status model (two independent axes)

- **Fulfillment** `status`: `pending → processing → shipped → delivered` (strictly
  forward, one step; `delivered` terminal). `shipped` sets `shipping.shippedAt`,
  `delivered` sets `deliveredAt`. Every change appends `statusHistory {status, at, by, note}`.
  On `delivered` the email includes per-item review links
  `${STOREFRONT_URL}/products/<slug>?review=1`.
- **Payment** `payment.status`: `unpaid → paid | cancelled`, `paid → cancelled`,
  `cancelled` terminal. `paid` sets `paidAt`; `cancelled` sets `cancelledAt` and
  **restocks** product `stock.quantity` (not variant stock, and doesn't refresh derived status).
- Admin can only request `paid` or `cancelled`.
- Analytics revenue counts **only `payment.status = 'paid'`**.

### 10.4 Order serialisation (`S.order`)

`{ id, orderNumber, email, phone, items[{id, productId, name, slug, sku, image, imageSeed, variantId, variantLabel, unitPrice, quantity, lineTotal}], totals, currency, coupon|null, shipping{optionKey, optionLabel, address, trackingNumber, carrier, shippedAt, deliveredAt, estimatedMinDays, estimatedMaxDays}, payment{method, status, paidAt}, status, statusHistory[{status, at, note}], giftWrap, giftNote, customerNote, itemCount, createdAt }`
+ `internalNote`, `billingAddress` for admin (`includeInternal`).

---

## 11. Data models (`src/models`)

Every model uses the `serialise` plugin: `_id → id` (string), drops `__v`, strips any
path with `private: true`, includes virtuals. All have `timestamps`.

Shared subdocs (`models/shared.js`): `money()`, `SeoSchema {title≤70, description≤200, keywords[], ogImage, noIndex}`,
`ImageSchema {url|null, seed (required), alt, type: studio|lifestyle|detail|scale, sortOrder}`,
`AgeRangeSchema {min, max}`, `AddressSchema {label, firstName*, lastName*, line1*, line2, city*, county, postcode (optional, uppercased), country (default 'United Kingdom'), phone, isDefault}`.

| Model | Key fields | Notes |
|---|---|---|
| **Product** | name, slug(unique), sku(unique sparse, upper), tagline, description(HTML), brand→Brand, categories[]→Category, collections[]→Collection, price, compareAtPrice, costPrice(private), currency, images[], hasModel3d, video, variants[{label, kind: colour|size|edition, swatch hex, sku, priceDelta, stock}], attributes[{name,value}], specs{dimensions, weight, materials[], batteries, pieces, safety[], origin}, inTheBox[], ageRange, stock{quantity, lowStockThreshold=5, preOrder, restockDate, status(derived), trackInventory=true}, rating{average,count,distribution}, badges[], tags[], isFeatured/isTrending/isNewArrival/isBestSeller, popularity, viewCount, salesCount, related[], bundle[], status: draft|active|archived (default draft), publishedAt, seo | Text index `product_search`; virtuals `discountPercent`, `inStock` |
| **Category** | name, slug, blurb, tone, ageRange, parent→Category, image, icon (Lucide name), sortOrder, isActive, seo | Max 2 levels; can't be own parent; virtual `children`. (`kind` was dropped in `393c409`) |
| **Brand** | name, slug, blurb, story, origin, founded(1600–now), tone, logo, sortOrder, isActive, seo | |
| **Collection** | name, slug, blurb, tone, chapters[{heading, body}], heroImage, isSeasonal, startsAt, endsAt, sortOrder, isActive, seo | Seasonal ones power `/seasonal/[slug]` |
| **Review** | product*, user, author, email(private), rating 1–5, title, body, boughtFor, verified, helpful, status: pending|approved|rejected, moderatedBy, moderatedAt, moderationNote(private) | |
| **BlogPost** | title, slug, excerpt, body: string[] (paragraphs), author, topic, tone, coverImage, publishedAt, isPublished, seo | virtual `readingMinutes` (200 wpm) |
| **Faq** | question, answer, group: delivery|safety|gifting|products, sortOrder, isPublished | |
| **Testimonial** | quote, author, role, avatar, sortOrder, isPublished | editorial, not user reviews |
| **ContactMessage** | name, email, subject, message, status: new|read|archived | |
| **Coupon** | code(upper unique), kind: percent|fixed|free-shipping, value, description, minSpend, isActive, validFrom, validUntil, usageLimit, usageCount, perUserLimit | `availability()` method |
| **ShippingOption** | key(unique, e.g. `standard`, `express`), label, description, price, minDays, maxDays, sortOrder, isActive | `standard` key has special free-shipping meaning |
| **Banner** | placement: announcement|hero|promo-strip|category-header, title, subtitle, image, video, href, ctaLabel, tone, category, isActive, startsAt, endsAt, sortOrder | static `liveFilter()` |
| **HomeSection** | type: hero|collection-tiles|product-rail|promo|testimonials|newsletter|rich-text, name (admin label), heading, subheading, body, image, tone, ctaLabel/Href, secondaryCtaLabel/Href, config{source: featured|new-arrivals|best-sellers|trending|manual, products[], collections[], limit 1–24 (8), showCanvas}, sortOrder, isActive | |
| **NavMenu** | location (unique): primary|shop-mega|collections-panel|footer, columns[{title, tone, links[], sortOrder}], links[{label, href, note, category, isActive, sortOrder}] | `primary` uses `links`; others use `columns` (collections-panel uses `links` in the serialiser) |
| **Settings** | singleton `key:'default'`; site{name='SA Toys', tagline, logo, favicon}, contact{email, phone, addressLines[], openingHours}, social[{platform, url, icon}], footer{blurb, copyright, newsletterHeading, newsletterBlurb}, seo{defaultTitle, titleTemplate='%s', defaultDescription, ogImage, robots}, commerce{currency='PKR', currencySymbol='Rs', freeShippingThreshold=5000, taxRateBps=0, pricesIncludeTax=true} | `Settings.load()` creates on first call |
| **Role** | name, slug, description, permissions[], isSystem | `can()`, virtual `isStaff` |
| **User** | firstName, lastName, email(unique, regex), phone, password(nullable, select:false, private, bcrypt 12), role→Role*, addresses[], wishlist[]→Product, isActive, isEmailVerified, lastLoginAt, resetTokenHash/Expires, otpHash/Expires/Attempts (all SHA-256, private) | Passwordless accounts have `password: null` → can't password-login |
| **Order** | see §10 | indexes on createdAt, status, user |

`models/index.js` requires all models once (so `populate` never hits an unregistered schema).

Shared enums live in `src/config/constants.js` and **must stay in sync with
`Toys-Web/src/data/schemas/index.ts`**: `TONES = coral, sunny, sky, mint, grape, bubble`;
`BADGES`, `AUTHORED_BADGES`, `STOCK_STATUSES`, `IMAGE_TYPES`, `VARIANT_KINDS`,
`FAQ_GROUPS`, `COUPON_KINDS`, `PUBLISH_STATUSES`, `MODERATION_STATUSES`,
`ORDER_STATUSES`, `PAYMENT_STATUSES`, transitions, `BANNER_PLACEMENTS`,
`HOME_SECTION_TYPES`, `RAIL_SOURCES`, `NAV_LOCATIONS`, `PRODUCT_SORTS`.

---

## 12. Serialisers (`services/serialisers.js`) — the storefront contract

The storefront parses responses with Zod, so these shapes are load-bearing:

- `product` — `{id, slug, name, tagline, description, sku, brandSlug, categorySlugs[], collectionSlugs[], price, compareAtPrice|null, currency, images[≥1]{url, seed, alt(≥4 chars, fallback "<name> — product image"), type}, hasModel3d, video, variants[{id,label,kind,swatch?,sku,priceDelta,stock}], attributes[], ageRange{min,max}, rating{average,count,distribution}, badges[], stock{status, quantity, restockDate}, specs{… materials default ['Not specified'] …}, inTheBox[], tags[], relatedIds[], bundleIds[], createdAt(publishedAt||createdAt), popularity, isFeatured, isTrending}`.
  If a product has no images, one placeholder `{url:null, seed:slug}` is emitted.
- `productCard` = `product` minus `description, specs, inTheBox, relatedIds, bundleIds, attributes`.
- `category {id, slug, name, blurb, tone, ageRange|null, image, icon, parentSlug, sortOrder}`
- `brand`, `collection {…, chapters, heroImage, isSeasonal}`, `review {id, productId, productSlug, author, rating, title, body, createdAt, verified, helpful, boughtFor}`,
  `post`, `faq`, `testimonial`, `shippingOption`, `coupon {code, value, description, minSpend}`,
  `banner`, `navMenu` (filters inactive links, sorts by sortOrder, links → `{label, href, note?}`),
  `order`, `customer {id, firstName, lastName, fullName, email, phone, role{id,name,slug,permissions}|null, addresses, isActive, isEmailVerified, lastLoginAt, createdAt}`,
  `settings {site, contact, social, footer, seo, commerce}`.
- Dates are ISO strings; relations are slugs.

Admin CRUD serialisers add admin-only fields (isActive, sortOrder, seo, dates, etc.).
`homeSectionCrud` returns the raw doc (with `id`) because `.lean()` rows lack `toJSON`.

---

## 13. Cross-service integration

### 13.1 Storefront cache invalidation (`services/revalidate.js`)

After admin writes, the API fire-and-forgets
`POST ${STOREFRONT_REVALIDATE_URL}` with header `x-revalidate-secret: ${REVALIDATE_SECRET}`
and body `{ tags: [...] }` (3 s timeout; failures only logged). Storefront falls back to a
60 s revalidate floor if unconfigured.

Tags: `products, categories, brands, collections, reviews, content, nav, settings, home, banners`.
Which writes purge what: products/stock/bulk → `products`; categories → `categories`;
brands → `brands`; collections → `collections`; posts/faqs/testimonials → `content`;
banners → `banners`; home sections → `home`; coupons & shipping → `settings`;
nav → `nav`; settings → `settings`; review moderation → `reviews, products`.
Contact messages and product **delete** purge nothing.

### 13.2 Storage (`services/storage`)

- `local`: writes `./uploads/<folder>/<file>`, URL `${PUBLIC_URL}/uploads/...`; path traversal guarded on delete. Dev only.
- `hostinger` (**production**, since 2026-10-19): writes into `MEDIA_ROOT` — the web root of the separate
  plain site `media.satoys.store` on the same Hostinger account — served from
  `MEDIA_PUBLIC_URL`. Refuses to boot if the root is inside the deployed app (Hostinger
  wipes app folders on deploy). See `hostinger/media/README.md` and `HOSTINGER_STORAGE_PLAN.md`.
- `hostinger-http`: same folders via the signed PHP receiver in `hostinger/media/public_html/_upload/` (fallback).
- `npm run media:check [-- hostinger-http]` runs an end-to-end upload/fetch/list/delete check.
- Firebase Cloud Storage was used until 2026-10-19; everything was migrated to media.satoys.store
  (old→new URLs in the `mediamigrationmap` collection) and the driver and `firebase-admin` removed.
  The Firebase project is on Spark (files unreadable, not yet deleted).
- `migrate:media` copies `./uploads` files (default `--from=local`) to the active driver, keeping folder/filename,
  and rewrites every matching URL in products, categories, brands, collections, banners,
  homesections, blogposts, testimonials, settings and orders (whole documents are walked).
  Idempotent; `--dry-run` reports only; never deletes source files.

### 13.3 Email (`utils/sendEmail.js`)

Brevo `POST https://api.brevo.com/v3/smtp/email`, 10 s timeout, returns boolean, never
throws. Sent for: order confirmation, fulfillment status change (+review links on
delivered), payment status change, password reset, OTP. OTP is the only flow that
fails the request when sending fails.

---

## 14. Deployment

- API, storefront and admin each run as a **Hostinger Node.js web app** (Unlimited plan),
  auto-deploying from GitHub `main` (pushing to main = deploying). Env vars are set in hPanel.
  DNS is at GoDaddy. Media is the separate plain site `media.satoys.store`. Full guide: `DEPLOY.md`.
  Hostinger overwrites the app's `hbuilds/` and its domain's `public_html` on every deploy,
  so nothing persistent may be written inside the app (hence the `hostinger` storage driver).
- The earlier Render deployment's leftovers (`render.yaml`, the keep-alive workflow) were
  deleted on 2026-10-19. Do **not** host on Vercel/Netlify functions
  (≈4.5 MB body cap breaks uploads).
- Admin's `NEXT_PUBLIC_API_URL` is build-time.
- CORS_ORIGINS must include every browser origin (most common "upload does nothing" cause).
- nginx in front? raise `client_max_body_size` (≥ 12m).
- Verification checklist in `DEPLOY.md §6`.

---

## 15. Known quirks, drift and gotchas (read before changing things)

1. `README.md` and `ENV_SETUP.md` are from the old
   generic backend (Stripe/SMTP). Ignore them.
2. `DOMAIN.md` drift: says currency GBP (now PKR); lists order statuses
   `paid/cancelled/refunded` (now split into fulfillment + payment axes); mentions
   category `kind` (removed); mentions a Wishlist model (wishlist is an array on User);
   lists `auth/refresh` (doesn't exist).
3. Leftover GBP/UK wording: `S.product`/`S.order` default `currency: 'GBP'` when missing;
   coupon min-spend error says `£`; `AddressSchema.country` defaults to `'United Kingdom'`;
   password-reset email subject says "LUMO".
4. `userController.listCustomers` / `getCustomer` filter orders with
   `status: { $nin: ['cancelled'] }`, but `cancelled` is now a **payment** status — so
   cancelled orders are still counted in customer spend.
5. `forgotPassword` reads `req.body.context === 'admin'`, but the Zod `forgotPassword`
   schema only has `email`, so `context` is stripped and the link always uses `STOREFRONT_URL`.
6. `readToken` checks `req.cookies.token`, but no cookie-parser is installed.
7. Payment cancellation restocks `stock.quantity` only — not variant stock, and doesn't
   call `refreshStockStatus()` (status updates on next save).
8. `/orders/track/:orderNumber` needs only the order number (rate-limited); it returns
   the full customer-facing order including address.
9. `POST /products/bulk` and `POST /reviews/bulk` have no Zod validation.
10. `listCollections`' `?seasonal=` is not Zod-validated; it relies on Mongoose casting
    the raw `'true'`/`'false'` string to a Boolean.
11. `sendOtp` creates a user row for any submitted email (rate-limited).
12. Validators mirror the storefront's Zod — when adding an enum value, update
    `config/constants.js` **and** `Toys-Web/src/data/schemas/index.ts`.
13. Express 5: validated query lives on `req.validatedQuery`; controllers use
    `req.validatedQuery || req.query`.
14. Mongoose 9: hooks are promise-style — **don't take `next`** in `pre` hooks; throw to reject.
15. `crudFactory.update` uses assign+save (hooks/validators run) — keep it that way.

---

## 16. Smoke test (`npm run smoke`)

Runs against `http://localhost:${PORT}/api/v1` and needs an admin login (see the
script for the env it reads). Sections: Health & docs; Authentication & authorisation;
Taxonomy CRUD; Product CRUD & validation; Synchronisation → storefront; Reviews →
rating recomputation; Commerce (coupons, shipping, orders, stock); Referential
integrity; Content & CMS; Analytics & roles; Cleanup. Creates and deletes its own fixtures.

---

## 17. Conventions for making changes

- New admin resource that is plain CRUD → model + Zod in `validators/` + `crudFactory`
  (set `tags` if the storefront reads it) + `mountCrud` in `routes/admin.js` + add the
  resource to `config/permissions.js` RESOURCES (and to seeded roles, then re-run
  `npm run seed:roles`) + a serialiser in `services/serialisers.js` + the OpenAPI spec.
- Never accept derived fields (rating, stock.status, popularity, derived badges, totals) from clients.
- Money stays integer minor units everywhere.
- Throw `ApiError.*` for expected failures; anything else becomes a generic 500.
- Wrap async handlers in `asyncHandler`.
- Keep comments explaining *why* — the codebase is heavily and deliberately commented.
- Git history uses short imperative commit subjects ("Fix …", "Add …").

---

## 18. Related projects

- **Storefront** `Toys-Web` — Next.js 16 App Router. Consumes `/bootstrap`, `/home`,
  catalogue, reviews, content; proxies browser writes (orders, reviews, contact, coupon
  validate, auth, account) through its own `/api/*` route handlers; exposes
  `/api/revalidate` for this API's webhook. See `Toys-Web/PROJECT_CONTEXT.md`.
- **Admin** `SAToys-Admin` — Next.js 16 client app, calls `/api/v1/admin/*` and
  `/auth/admin/login` with a Bearer token. See `SAToys-Admin/PROJECT_CONTEXT.md`.
