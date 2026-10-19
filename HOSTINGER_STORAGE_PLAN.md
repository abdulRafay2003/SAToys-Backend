# Plan — Replace Firebase Storage with Hostinger

Status: **Phases 1–2 and the Phase 4 script implemented (uncommitted); Phase 3 switch, the Phase 4 run, and Phase 5 pending.**
Hosting (confirmed by the owner): the API runs as a **Hostinger Node.js web app** on the
Unlimited plan, in the same account that will hold the media. The repo's `render.yaml`,
`.github/workflows/keep-alive.yml` and the Render parts of `DEPLOY.md` are leftovers from an
earlier Render deployment.

---

## 1. Today

```
Admin ─multipart─▶ API ─Admin SDK─▶ Firebase Cloud Storage  → https://firebasestorage.googleapis.com/…
```
Everything outside `src/services/storage/` only sees the returned `{ url, key }`, so the
switch is a new driver plus config. The admin panel needs no code change.

## 2. What Hostinger gives us

[Plan limits](https://www.hostinger.com/support/6976044-parameters-and-limits-for-hosting-plans), Unlimited plan:
50 GB disk, 600k inodes, PHP upload/POST up to 2 GB, 5 Node.js apps, free SSL and subdomains.

Key constraint, from [Hostinger's Node.js deployment docs](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/):
a Node app's `hbuilds/` and its domain's `public_html` are **overwritten on every deployment**.
Uploads must therefore live in a **separate plain website** (`media.satoys.store`), whose
`public_html` deployments never touch.

## 3. Design

```
Admin ─▶ API (Node app, api.satoys.store) ─fs write─▶ ~/domains/media.satoys.store/public_html/<folder>/<file>
Public:                                               https://media.satoys.store/<folder>/<file>  (static, LiteSpeed)
```

| Driver | When | How |
|---|---|---|
| `hostinger` ✅ primary | API on the same Hostinger account | Writes into `MEDIA_ROOT` (atomic temp file + rename, no overwrite, folder allowlist, path-traversal guard). Refuses to boot if `MEDIA_ROOT` is relative, inside the deployed app or `hbuilds`, or not writable |
| `hostinger-http` fallback | The Node process can't write to the media folder, or the API moves off Hostinger | Signed HTTPS POST to the PHP receiver `hostinger/media/public_html/_upload/index.php` (HMAC + timestamp, MIME sniffing, size caps) |

Media site `.htaccess`: no script execution, no listing, `nosniff`, a year-long immutable
cache (filenames are unique per upload), and sandboxed SVGs. The separate origin keeps any
uploaded file off the shop's and admin's origins.

## 4. Phases

### Phase 1 — Backend code ✅ done
- `src/services/storage/hostinger.js` (disk) and `hostinger-http.js` (receiver), both registered in `storage/index.js`.
- `config/env.js` `media` block: `MEDIA_ROOT`, `MEDIA_PUBLIC_URL`, `MEDIA_UPLOAD_URL`, `MEDIA_UPLOAD_SECRET`.
- `safeFilename()` takes the extension from the MIME type.
- `uploadController` turns host rejections (400/413) into readable admin errors.
- `npm run media:check [-- hostinger-http]` runs upload → public fetch → list → delete.
- `hostinger/media/`: `.htaccess`, receiver, config example, README with the hPanel steps.
- `.env.example` and `STORAGE.md` updated.
- Not done (optional): disk-buffered video uploads. Multer still holds a ≤ 50 MB video in RAM.

### Phase 2 — Storefront ✅ done
- `Toys-Web/next.config.ts` allows `MEDIA_PUBLIC_URL`'s host (default `media.satoys.store`). Firebase hosts stay allowed until migration is done.
- **Deploy the storefront before Phase 3**, otherwise `next/image` rejects the new host.

### Phase 3 — Production switch (owner, in hPanel; ~20 min)
1. Add website `media.satoys.store` as an **empty PHP/HTML site** (not a subdomain folder inside a Node app's `public_html`). SSL + Force HTTPS.
2. Upload `hostinger/media/public_html/.htaccess` into its `public_html`.
3. API app → Environment variables: `STORAGE_DRIVER=hostinger`, `MEDIA_ROOT=<absolute path of that public_html>`, `MEDIA_PUBLIC_URL=https://media.satoys.store`.
4. Deploy the backend with this code. Check the log for `Hostinger storage ready`.
5. In the admin: upload images (product gallery batch, category, banner) and a product video. URLs should start with `https://media.satoys.store/`. Check the storefront PDP renders them through `/_next/image`.
6. If boot reports **not writable**: use `hostinger-http` instead (README → Fallback).
7. Upload a ~45 MB video once. Hostinger's proxy body limit for Node apps isn't documented, so this confirms the real ceiling.

### Phase 4 — Migrate existing Firebase files (script ✅ done; run pending)
`src/scripts/migrateMedia.js` (`npm run migrate:media`; it replaces `migrateImages.js`, and `migrate:images` now runs it with `--from=local`):
- Recognises both Firebase URL shapes (`firebasestorage.googleapis.com/v0/b/<bucket>/o/<key>` and `storage.googleapis.com/<bucket>/<key>`) anywhere in documents of products, categories, brands, collections, banners, homesections, blogposts, testimonials, settings and **orders** (line-item image snapshots).
- Downloads each file once (shared URLs are deduplicated), saves it through the active driver with the **same folder/filename** (unknown folders → `misc`; non-standard names get a fresh generated name), then `$set`s only the changed top-level fields.
- `--dry-run` reports only. `--only=<collection>` limits the run. If an earlier interrupted run already stored a file, the script reuses it. Source files that are gone (404/403) are reported and their URLs left unchanged. Failures leave URLs unchanged and set exit code 2, so re-running retries them.
- Never deletes Firebase files.

How to run it in production. The files must be written on the Hostinger box, so the API runs the migration itself (`src/services/mediaMigrationJob.js`):
1. Firebase Storage must be readable. A Spark-plan project returns **402** for every file, so upgrade it to Blaze for the duration.
2. On api.satoys.store, add the env var `MEDIA_MIGRATE_ON_BOOT=firebase` (or `firebase-dry-run` to report only) and redeploy.
3. Watch the runtime log for `Media migration started` … `Media migration finished {copied, documents, missing, failed}`. The shop keeps serving throughout.
4. **Remove `MEDIA_MIGRATE_ON_BOOT`** and redeploy. A completed run with no failures is skipped anyway, but the variable shouldn't linger.

Safety built in:
- A lock document in `jobs` (`_id: media-migration`) stops concurrent runs. Stale locks are taken over after 30 min.
- Every old→new URL is recorded in `mediamigrationmap`, so the rewrite can be reversed.
- Failures leave URLs unchanged, and a rerun retries them.
- The storefront cache is purged automatically when documents change.
- The CLI (`npm run migrate:media`) still works wherever the target driver is reachable, e.g. with `hostinger-http`.

Afterwards, spot-check the storefront and admin, then downgrade Firebase.

### Phase 5 — Remove Firebase (after 1–2 quiet weeks)
- Delete `storage/firebase.js` and the `firebase-admin` dependency, the `firebase` block and `normalisePrivateKey()` in `env.js`, and the `FIREBASE_*` vars in `.env.example` and hPanel.
- Remove the Firebase hosts from `Toys-Web/next.config.ts`.
- Update `STORAGE.md`, `DEPLOY.md` and the `PROJECT_CONTEXT.md` files.
- Back up, then delete the Firebase bucket (this stops Blaze billing).
- Separately, decide whether to delete the Render leftovers (`render.yaml`, `keep-alive.yml`).

## 5. Risks

| Risk | Mitigation |
|---|---|
| Media placed under a Node app's `public_html` is wiped on deploy | Separate site. The driver refuses roots inside the app or `hbuilds` |
| Node process not permitted to write to another site's folder | Boot check names it. Switch to `hostinger-http` |
| Orphaned files (removing an image in the admin doesn't delete the file) | Later: a cleanup script comparing folder listings against DB references. 600k-inode budget |
| Large videos vs. proxy limits / RAM | Phase 3 step 7. Optional disk-buffered multer |
| Rollback | Until Phase 5, set `STORAGE_DRIVER=firebase` again |
