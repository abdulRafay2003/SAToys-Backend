# Image storage

Uploads go **admin panel → this API → storage**. The browser never talks to the
storage provider directly, which means the credentials stay on the server, there
are no Storage security rules to get wrong, and the permission check already on
the upload route is the only gate.

Everything outside `src/services/storage/` only ever sees the returned URL
string, so switching providers is an environment variable.

## Drivers

| `STORAGE_DRIVER` | Where files go | Use it when |
|---|---|---|
| `local` (default) | `./uploads`, served from `/uploads` by this API | Development, or a VPS with a persistent disk |
| `firebase` | Firebase Cloud Storage | Anything deployed to Render, Railway, Fly, Heroku, Vercel, Cloud Run |

**Local disk does not survive a redeploy on ephemeral hosts.** The container
filesystem is rebuilt each time, so uploaded product photos would silently
disappear. That is the reason the Firebase driver exists.

## Setting up Firebase

1. **Create a project** at <https://console.firebase.google.com>. An existing
   Google Cloud project works too.

2. **Enable Cloud Storage** — Build → Storage → Get started. Choose a location
   close to your customers; it **cannot be changed afterwards**.

   Firebase now asks for billing (Blaze plan) to create a Storage bucket. Blaze
   is pay-as-you-go with a free tier that a small catalogue sits inside — 5 GB
   stored and 1 GB/day egress. Set a budget alert if that matters to you.

3. **Create a service account key** — Project settings → Service accounts →
   *Generate new private key*. A JSON file downloads. Copy three values out of
   it into your `.env`, then delete the file. It is a credential: do not commit
   it, and do not paste it into a chat.

   | JSON field | Environment variable |
   |---|---|
   | `project_id` | `FIREBASE_PROJECT_ID` |
   | `client_email` | `FIREBASE_CLIENT_EMAIL` |
   | `private_key` | `FIREBASE_PRIVATE_KEY` |

4. **Find the bucket name** — Storage → Files, shown at the top as
   `gs://your-project-id.firebasestorage.app`. Use it *without* the `gs://`
   prefix as `FIREBASE_STORAGE_BUCKET`. Older projects end in `.appspot.com`
   instead; either is fine, just copy what the console shows.

5. **Switch the driver**: `STORAGE_DRIVER=firebase`, then restart the API.

### The private key

In a **`.env` file**, wrap it in double quotes and keep the literal `\n`
sequences — dotenv strips the quotes and expands them:

```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

In a **host dashboard** (Render, Vercel, Fly) do **not** include the quotes:
the field is stored verbatim, so they end up inside the value.

`src/config/env.js` normalises both forms, plus real newlines pasted into a
multi-line field, so any reasonable paste works.

## How images are made public

Objects are uploaded with a Firebase **download token** — a UUID in the object's
metadata — and the URL returned is the same form the client SDK's
`getDownloadURL()` produces:

```
https://firebasestorage.googleapis.com/v0/b/BUCKET/o/products%2Ffile.png?alt=media&token=UUID
```

This deliberately avoids two alternatives:

- **Making the bucket public via IAM** would work, but uniform bucket-level
  access (on by default for new buckets) rejects per-object `makePublic()`, and
  granting `allUsers` at the bucket level exposes everything in it, including
  any non-catalogue file added later.
- **Signed URLs** expire, so every stored product image would eventually
  404 unless something refreshed them.

Deleting an object invalidates its URL immediately, which is the behaviour you
want when an image is removed in the admin.

## Storefront configuration

`Toys-Website/next.config.ts` lists the hosts the image optimiser may fetch
from. `firebasestorage.googleapis.com` and `storage.googleapis.com` are already
allowed. If you use a custom domain or CDN in front of the bucket, add it there
— an open `hostname: "**"` would let anyone use the site as an image proxy.

Next refuses to optimise an upstream that resolves to a private IP, so images
served by the **local** driver over `http://localhost` are rendered
unoptimised in development. Firebase URLs are public HTTPS and go through the
optimiser normally.
