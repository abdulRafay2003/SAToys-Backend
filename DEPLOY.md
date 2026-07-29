# Deploying, with image uploads working

Three services deploy separately: the API, the admin panel, and the storefront.
Image upload touches all three, and the failure modes are mostly configuration
rather than code — this is the order that avoids them.

## 0. Choose a host for the API that is not serverless

Uploads are `multipart/form-data` buffered in memory, up to 5 MB per file and 12
files per request.

**Do not put this API on Vercel or Netlify functions.** They cap request bodies
at ~4.5 MB and a batch upload will fail with an opaque 413 that looks like a
Firebase problem but is not. Use a host that runs a normal long-lived Node
process: Render, Railway, Fly.io, a VPS, or Cloud Run.

The storefront and admin are Next.js apps and are fine on Vercel.

If your host puts nginx in front, raise its body limit too — the default of 1 MB
will reject uploads before Express sees them:

```nginx
client_max_body_size 12m;
```

## 1. Firebase

Follow [STORAGE.md](./STORAGE.md). You need a project with Cloud Storage
enabled, a service-account key, and the bucket name.

## 2. API environment

```bash
NODE_ENV=production
PORT=5001                       # or whatever the host assigns

MONGODB_URI=mongodb+srv://...   # Atlas, not localhost
JWT_SECRET=<64 random hex chars>

# Image storage
STORAGE_DRIVER=firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app

# CORS — the single most common cause of "upload does nothing"
CORS_ORIGINS=https://admin.yourdomain.com,https://yourdomain.com
STOREFRONT_URL=https://yourdomain.com
ADMIN_URL=https://admin.yourdomain.com

# Cache invalidation (see step 5)
STOREFRONT_REVALIDATE_URL=https://yourdomain.com/api/revalidate
REVALIDATE_SECRET=<32 random hex chars>
```

**`CORS_ORIGINS` is an allow-list and defaults to `localhost:3000,3001`.** If you
forget it, the admin's upload request is blocked by the browser before it
reaches the API, and the panel shows a generic network error with nothing in the
server logs. That is almost always what has gone wrong.

Setting the private key in a host's environment UI: paste it as a single line
with literal `\n`, wrapped in double quotes. A real newline truncates the value
and the API refuses to boot with an `invalid PEM` error — which is deliberate,
so you find out at deploy time rather than on the first upload.

## 3. Admin environment — note this is build-time

```bash
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

`NEXT_PUBLIC_*` variables are **inlined into the JavaScript bundle at build
time**, not read at runtime. Setting it only as a runtime variable leaves the
built admin pointing at `http://localhost:5001`, which fails in a way that looks
like the API is down. If you change it, you must rebuild — restarting is not
enough.

## 4. Storefront environment

```bash
API_URL=https://api.yourdomain.com/api/v1     # server-side, runtime
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
REVALIDATE_SECRET=<the same secret as the API>
```

`API_URL` has no `NEXT_PUBLIC_` prefix on purpose — the storefront fetches the
catalogue in server components, so the browser never sees the API address and
there is no CORS surface for catalogue data.

Image hosts are already allow-listed in `next.config.ts`
(`firebasestorage.googleapis.com`, `storage.googleapis.com`). If you front the
bucket with a CDN or custom domain, add that hostname there and redeploy.

## 5. Cache invalidation

The storefront caches API responses with a 60-second floor. Without the webhook,
an image uploaded in the admin appears on the storefront within a minute. With
it, the affected tags are invalidated immediately on write.

Set `STOREFRONT_REVALIDATE_URL` and `REVALIDATE_SECRET` on the API, and the same
`REVALIDATE_SECRET` on the storefront. If either is missing the API skips the
call and logs it — writes still succeed, they just fall back to the 60-second
window.

## 6. Migrating images already on local disk

Switching drivers only changes where **new** uploads go. Products whose images
were uploaded under the local driver still hold `http://localhost:5001/uploads/…`
URLs in Mongo, which resolve to nothing in production.

```bash
npm run migrate:images
```

Run it once, after `STORAGE_DRIVER=firebase` is set and with the old `uploads/`
directory present. It uploads each local file to Firebase and rewrites the URL
on every document that referenced it. It is idempotent — URLs already pointing
at Firebase are skipped — so a re-run is safe.

## 7. Verify, in this order

1. `GET https://api.yourdomain.com/api/health` → `{"success":true}`
2. API logs at boot show `Firebase storage ready` with your bucket name. If they
   show nothing, `STORAGE_DRIVER` is not set and you are still on local disk.
3. Sign in to the admin, open a product, upload an image. The response URL in
   the network tab should start with `https://firebasestorage.googleapis.com`.
4. The file appears in Firebase console → Storage → Files → `products/`.
5. Load the product on the storefront. The image renders, and its `src` goes
   through `/_next/image?url=…` — meaning the optimiser accepted the host.

If step 5 shows the gradient tile instead of the photo, the product's `images[0].url`
is null — the upload succeeded but was not saved onto the product. Check that
the product form was saved after the upload.
