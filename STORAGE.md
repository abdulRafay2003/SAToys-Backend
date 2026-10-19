# Image storage

Uploads go **admin panel → this API → storage**. The browser never talks to the
storage host directly, which means the credentials stay on the server and the
permission check already on the upload route is the only gate.

Everything outside `src/services/storage/` only ever sees the returned URL
string, so switching drivers is an environment variable.

## Drivers

| `STORAGE_DRIVER` | Where files go | Use it when |
|---|---|---|
| `local` (default) | `./uploads`, served from `/uploads` by this API | Development, or a VPS with a persistent disk |
| `hostinger` | Written straight into the media site's web root (`MEDIA_ROOT`) on the same Hostinger account; served from `MEDIA_PUBLIC_URL` | **Production** — the API runs as a Hostinger Node.js app |
| `hostinger-http` | The same folder, via the signed PHP receiver at `MEDIA_UPLOAD_URL` | Fallback if the Node app cannot write to `MEDIA_ROOT`, or the API ever runs off Hostinger |

An unknown value falls back to `local`.

**Local disk does not survive a redeploy on Hostinger.** Hostinger replaces a
Node.js app's folder (`hbuilds/`) and its domain's `public_html` on every
deployment, so anything written inside the app silently disappears. That is why
production media lives in a separate plain website, `media.satoys.store`, whose
`public_html` deployments never touch.

## Production: `hostinger`

```
Admin ─▶ API (api.satoys.store) ─fs write─▶ ~/domains/media.satoys.store/public_html/<folder>/<file>
Public:                                     https://media.satoys.store/<folder>/<file>
```

```bash
STORAGE_DRIVER=hostinger
MEDIA_ROOT=/home/u224722549/domains/media.satoys.store/public_html
MEDIA_PUBLIC_URL=https://media.satoys.store
```

- Writes are atomic (temp file + rename), never overwrite, and are confined to
  the folder allowlist (`products`, `categories`, `brands`, `collections`,
  `banners`, `misc`) with a path-traversal guard.
- The driver refuses to start if `MEDIA_ROOT` is relative, inside the deployed
  app or `hbuilds`, or not writable. The API still boots and logs
  `Storage driver "hostinger" is not usable …`; only uploads fail.
- At startup the API installs the media site's `.htaccess` (no script
  execution, no directory listing, `nosniff`, year-long immutable caching,
  sandboxed SVGs).

Set-up steps for the media site are in
[hostinger/media/README.md](./hostinger/media/README.md). Check a configured
driver end to end (upload → public fetch → list → delete) with:

```bash
npm run media:check
```

## Fallback: `hostinger-http`

If the Node process cannot write to another site's folder, upload through the
PHP receiver in `hostinger/media/public_html/_upload/` instead:

```bash
STORAGE_DRIVER=hostinger-http
MEDIA_UPLOAD_URL=https://media.satoys.store/_upload/
MEDIA_UPLOAD_SECRET=<32+ chars, same as `secret` in media-config.php>
MEDIA_PUBLIC_URL=https://media.satoys.store
```

Requests are signed with HMAC-SHA256 over timestamp, action, folder, filename
and file hash (5-minute window). The receiver checks the folder allowlist, a
strict filename pattern, extension against sniffed MIME type and size caps, and
never overwrites. Test with `npm run media:check -- hostinger-http`.

## Development: `local`

Files land in `./uploads/<folder>/<file>` and are served by this API at
`${PUBLIC_URL}/uploads/…` (immutable caching in production, `nosniff`, no HTML
execution). Nothing to configure.

To move files left in `./uploads` onto the active driver and rewrite every URL
that pointed at them:

```bash
npm run migrate:media -- --dry-run   # report only
npm run migrate:media                # copy + rewrite (re-runnable)
```

## History

Product media lived in Firebase Cloud Storage until 2026-10-19, when it was
copied to `media.satoys.store` and every stored URL was rewritten (see
[HOSTINGER_STORAGE_PLAN.md](./HOSTINGER_STORAGE_PLAN.md)). The Firebase driver
and `firebase-admin` have since been removed.

## Storefront configuration

`Toys-Web/next.config.ts` lists the hosts the image optimiser may fetch from:
the host of `MEDIA_PUBLIC_URL` (default `media.satoys.store`) and the API on
`http://localhost` for development. If media ever moves to another host or a
CDN, add it there and redeploy the storefront **before** switching the API — an
open `hostname: "**"` would let anyone use the site as an image proxy.

Next refuses to optimise an upstream that resolves to a private IP, so images
served by the **local** driver over `http://localhost` are rendered
unoptimised in development. Media-site URLs are public HTTPS and go through the
optimiser normally.
