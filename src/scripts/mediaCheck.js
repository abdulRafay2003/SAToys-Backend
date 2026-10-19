require('../config/env');

const crypto = require('crypto');

/**
 * End-to-end check of Hostinger media storage.
 *
 *   npm run media:check                    — tests the `hostinger` (disk) driver
 *   npm run media:check -- hostinger-http  — tests the PHP receiver instead
 *
 * Uses the driver directly, whatever STORAGE_DRIVER says, so storage can be
 * verified on the server before the API is switched over to it. Run it on the
 * Hostinger box itself (SSH, in the app folder) for the disk driver — that is
 * the only place its MEDIA_ROOT exists. Leaves nothing behind.
 */

const driverName = process.argv[2] || 'hostinger';
if (!['hostinger', 'hostinger-http'].includes(driverName)) {
  console.error(`Unknown driver "${driverName}" — use hostinger or hostinger-http`);
  process.exit(1);
}
const driver = require(`../services/storage/${driverName}`);

// A 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const step = async (label, fn) => {
  process.stdout.write(`  ${label} … `);
  try {
    const result = await fn();
    console.log('ok');
    return result;
  } catch (error) {
    console.log(`FAILED\n    ${error.message}`);
    process.exit(1);
  }
};

(async () => {
  console.log(`Hostinger media check — driver: ${driverName}`);

  await step('configuration', async () => driver.init());
  if (driver.ping) {
    await step('signed ping', async () => {
      const data = await driver.ping();
      if (!data?.ok) throw new Error('Receiver did not acknowledge the ping');
    });
  }

  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.png`;

  const { url } = await step('upload', () =>
    driver.save({ folder: 'misc', filename, buffer: PNG, mimeType: 'image/png' }),
  );
  console.log(`    ${url}`);

  await step('public fetch', async () => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `GET ${url} → ${res.status}. The file was written but is not served at MEDIA_PUBLIC_URL — ` +
          'check that MEDIA_ROOT is that site’s web root.',
      );
    }
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/png')) throw new Error(`Unexpected content-type: ${type}`);
    const cache = res.headers.get('cache-control') || '(none)';
    if (!cache.includes('immutable')) console.log(`\n    note: cache-control is ${cache} — is the media .htaccess deployed?`);
  });

  await step('list', async () => {
    const files = await driver.list('misc');
    if (!files.some((f) => f.filename === filename)) throw new Error('Uploaded file missing from listing');
  });

  await step('delete', () => driver.remove({ folder: 'misc', filename }));

  await step('gone after delete', async () => {
    const res = await fetch(url, { cache: 'no-store' });
    // A CDN in front of the subdomain may keep serving its cached copy, so a
    // 200 here is reported rather than failed.
    if (res.status !== 404) console.log(`\n    note: still ${res.status} — likely a CDN cache in front of the host`);
  });

  console.log('All checks passed.');
})();
