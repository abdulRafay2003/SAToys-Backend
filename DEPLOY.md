# Deploying SA Toys

Three apps deploy separately, all on one Hostinger account, plus a static media
site. Uploads touch all of them, and the failure modes are mostly configuration
rather than code — this is the order that avoids them.

## 0. Topology

| Service | Domain | Host | Repo |
|---|---|---|---|
| API | `api.satoys.store` | Hostinger **Node.js web app** | SAToys-Backend |
| Storefront | `www.satoys.store` (and `satoys.store`) | Hostinger **Node.js web app** | Toys-Web |
| Admin | `admin.satoys.store` | Hostinger **Node.js web app** | SAToys-Admin |
| Media | `media.satoys.store` | Hostinger **plain website** (static, LiteSpeed) | — files written by the API |

- **Deploys are automatic:** each Node.js app is connected to its GitHub repo and
  rebuilds whenever `main` changes. Pushing to `main` *is* deploying — commit to a
  branch if the change is not ready to go live.
- **Environment variables** are set per app in hPanel → the app → Environment
  variables. Changing one needs a redeploy (and for `NEXT_PUBLIC_*`, a rebuild).
- **DNS is at GoDaddy.** Each subdomain points at the Hostinger site that serves
  it; SSL is issued by Hostinger (Force HTTPS on).
- **Hostinger wipes app folders on deploy.** A Node app's `hbuilds/` and its
  domain's `public_html` are replaced every time, so nothing persistent may be
  written inside an app. That is why media lives in the separate
  `media.satoys.store` site (see [STORAGE.md](./STORAGE.md)).
- Do **not** move the API onto Vercel/Netlify functions: they cap request bodies
  at ~4.5 MB and batch uploads (up to 5 MB × 12 images, 50 MB video) fail with an
  opaque 413.

## 1. Media site

One-time, already done in production. Steps in
[hostinger/media/README.md](./hostinger/media/README.md): add
`media.satoys.store` as an **empty PHP/HTML website** (not a folder inside a
Node app), enable SSL, note the absolute path of its `public_html`. The API
installs the `.htaccess` there itself at startup.

## 2. API environment

```bash
NODE_ENV=production

MONGODB_URI=mongodb+srv://...   # Atlas
JWT_SECRET=<64 random hex chars>

# Media
STORAGE_DRIVER=hostinger
MEDIA_ROOT=/home/u224722549/domains/media.satoys.store/public_html
MEDIA_PUBLIC_URL=https://media.satoys.store

# CORS — the single most common cause of "upload does nothing"
CORS_ORIGINS=https://www.satoys.store,https://satoys.store,https://admin.satoys.store
STOREFRONT_URL=https://www.satoys.store
ADMIN_URL=https://admin.satoys.store
PUBLIC_URL=https://api.satoys.store

# Email (Brevo HTTP API)
BREVO_API_KEY=...
EMAIL_FROM_ADDRESS=<sender verified in Brevo>
EMAIL_FROM_NAME=SA Toys

# Cache invalidation (see step 5)
STOREFRONT_REVALIDATE_URL=https://www.satoys.store/api/revalidate
REVALIDATE_SECRET=<32 random hex chars>
```

`PORT` is assigned by Hostinger; leave it unset.

**`CORS_ORIGINS` is an allow-list and defaults to `localhost:3000,3001`.** If an
origin is missing, the admin's request is blocked by the browser before it
reaches the API, and the panel shows a generic network error with nothing in the
server logs.

If `MEDIA_ROOT` turns out not to be writable from the Node app, switch to
`STORAGE_DRIVER=hostinger-http` (STORAGE.md → Fallback).

## 3. Admin environment — note this is build-time

```bash
NEXT_PUBLIC_API_URL=https://api.satoys.store/api/v1
NEXT_PUBLIC_STOREFRONT_URL=https://www.satoys.store
```

`NEXT_PUBLIC_*` variables are **inlined into the JavaScript bundle at build
time**, not read at runtime. If you change one, the admin must be rebuilt —
restarting is not enough. A missing value leaves the built admin pointing at
localhost, which looks like the API is down.

## 4. Storefront environment

```bash
API_URL=https://api.satoys.store/api/v1     # server-side, runtime
NEXT_PUBLIC_SITE_URL=https://www.satoys.store
MEDIA_PUBLIC_URL=https://media.satoys.store  # optional; this is the default
REVALIDATE_SECRET=<the same secret as the API>
```

`API_URL` has no `NEXT_PUBLIC_` prefix on purpose — the storefront fetches the
catalogue in server components, so the browser never sees the API address.

The storefront's `npm run build` is `next build --webpack`: Hostinger's build
machine crashes Turbopack. `MEDIA_PUBLIC_URL`'s host is the only remote image
host `next.config.ts` allows besides localhost; if media ever moves, deploy the
storefront with the new host **before** switching the API.

## 5. Cache invalidation

The storefront caches API responses with a 60-second floor. With the webhook,
admin writes invalidate the affected tags immediately.

Set `STOREFRONT_REVALIDATE_URL` and `REVALIDATE_SECRET` on the API, and the same
`REVALIDATE_SECRET` on the storefront. If either is missing the API skips the
call and logs it — writes still succeed, they just fall back to the 60-second
window.

## 6. Verify, in this order

1. `GET https://api.satoys.store/api/health` → `{"success":true,…}`
2. The API's runtime log at boot shows `Hostinger storage ready`. A
   `Storage driver "hostinger" is not usable` line names what is wrong
   (path, permissions); the shop still serves, only uploads fail.
3. Sign in to the admin, open a product, upload an image. The response URL in
   the network tab starts with `https://media.satoys.store/products/`.
4. Open that URL directly — it loads, with a long `Cache-Control`.
5. Load the product on the storefront. The image renders and its `src` goes
   through `/_next/image?url=…` — meaning the optimiser accepted the host.

If step 5 shows the placeholder tile instead of the photo, the product's
`images[0].url` is empty — the upload succeeded but the product form was not
saved afterwards.
