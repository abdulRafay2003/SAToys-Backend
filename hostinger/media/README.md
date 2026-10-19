# Hostinger media site

Product photos, banners and videos are stored on the Hostinger plan, in a small
**plain (non-Node) website**, `media.satoys.store`, and served from there as static files.

```
Admin ─▶ API (Hostinger Node.js app) ─writes─▶ /home/<user>/domains/media.satoys.store/public_html/<folder>/<file>
Public URL:                                    https://media.satoys.store/<folder>/<file>
```

The API and the media site live in the **same Hostinger account**, so the API writes files
straight to disk (`STORAGE_DRIVER=hostinger`, `src/services/storage/hostinger.js`).
Nothing runs on the media site except the web server.

### Why a separate site, and not a folder in the API

Hostinger replaces a Node.js app's folders (`domains/<domain>/hbuilds/…` and that
domain's `public_html`) **on every deployment**. Uploads stored there would be deleted
by the next deploy. A separate non-Node website's `public_html` is never touched by
deployments. The driver refuses to start if `MEDIA_ROOT` points inside the app.

> ⚠️ Do **not** create `media` as a subdomain whose folder lands inside the storefront's or
> API's `public_html` (hPanel's default for a subdomain is `public_html/media`). If that
> domain is a Node.js app, its `public_html` is wiped on deploy and the media goes with it.
> Add `media.satoys.store` as its **own website** (or give the subdomain a custom folder
> outside any Node app's `public_html`).

## One-time setup (hPanel)

1. **Websites → Add website → "Empty PHP/HTML website"**, domain `media.satoys.store`.
   hPanel creates `/home/<user>/domains/media.satoys.store/public_html`.
   (If `satoys.store` DNS isn't managed by Hostinger, add an `A` record
   `media → <hosting IP shown in hPanel>` at your DNS provider.)
2. **Security → SSL** for `media.satoys.store`; turn on **Force HTTPS**.
3. Nothing to upload: on startup the `hostinger` driver installs `public_html/.htaccess` from
   this folder into `MEDIA_ROOT` (it blocks script execution and directory listings, sets
   year-long caching and `nosniff`, and sandboxes SVGs), and keeps it in sync on later deploys.
   It only replaces a file it wrote itself. If hPanel created its own `.htaccess` there, the
   log says so, and you should delete that file so the managed one can be installed.
4. Find the **absolute path** of that folder. File Manager shows it, or over SSH run
   `cd ~/domains/media.satoys.store/public_html && pwd`. It looks like
   `/home/u123456789/domains/media.satoys.store/public_html`.
5. **Websites → api.satoys.store → Node.js → Environment variables**, add:
   ```
   STORAGE_DRIVER=hostinger
   MEDIA_ROOT=/home/u123456789/domains/media.satoys.store/public_html
   MEDIA_PUBLIC_URL=https://media.satoys.store
   ```
   then redeploy or restart the app. The startup log should show
   `Hostinger storage ready {"root":"…","publicUrl":"https://media.satoys.store"}`.
   If the API refuses to start, the message says exactly what is wrong (path not absolute,
   inside the app, or not writable).
6. Optional, if `node`/`npm` are available in your SSH session: before switching `STORAGE_DRIVER`, test from the app folder
   (`cd ~/domains/api.satoys.store/hbuilds/current/nodejs` or wherever hPanel shows the app):
   ```bash
   MEDIA_ROOT=... MEDIA_PUBLIC_URL=https://media.satoys.store npm run media:check
   ```
   This uploads a 1×1 PNG, fetches it over HTTPS, lists the folder and deletes it again.

## Checks

```bash
curl -I https://media.satoys.store/products/   # → 403 (no listing)
```
After an upload from the admin, open the returned URL. The response should include
`cache-control: public, max-age=31536000, immutable` and `x-content-type-options: nosniff`.

## Fallback: the PHP receiver (`STORAGE_DRIVER=hostinger-http`)

Use this only if the Node app is **not allowed to write** to the media site's folder (the
startup check reports `not writable`), or if the API is ever moved off Hostinger. The API
then POSTs signed requests to a PHP script that does the writing:

1. Upload `public_html/_upload/` (both `index.php` and its `.htaccess`) into the media site's `public_html`.
2. Copy `media-config.example.php` to `media-config.php` **one level above** `public_html`
   (`domains/media.satoys.store/media-config.php`) and set a fresh secret:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. hPanel → PHP Configuration for the media site: PHP 8.1+, `upload_max_filesize` / `post_max_size` ≥ 60M, `fileinfo` enabled.
4. API env: `STORAGE_DRIVER=hostinger-http`, `MEDIA_UPLOAD_URL=https://media.satoys.store/_upload/`,
   `MEDIA_UPLOAD_SECRET=<same secret>`, `MEDIA_PUBLIC_URL=https://media.satoys.store`.
5. Test: `npm run media:check -- hostinger-http`. An unsigned
   `curl -X POST -F action=ping https://media.satoys.store/_upload/` must return `401`.

Security model of the receiver: HMAC-SHA256 over timestamp, action, folder, filename and
file hash, with a 5-minute window; folder allowlist; a strict filename pattern; extension
vs. sniffed-MIME check; size caps; no overwrites. No script can execute in the media tree
except `_upload/index.php`.

## Moving existing media

Product media was moved from Firebase Storage to this site on 2026-10-19 by the
API's boot-time migration (`MEDIA_MIGRATE_ON_BOOT`, see `HOSTINGER_STORAGE_PLAN.md` →
Phase 4). Firebase is retired; the same tooling still moves files left on a local
`./uploads` folder:

```bash
npm run migrate:media -- --dry-run   # what would move, nothing written
npm run migrate:media                # copy + rewrite (re-runnable)
```
