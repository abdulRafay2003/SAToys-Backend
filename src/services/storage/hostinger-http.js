const crypto = require('crypto');
const { media } = require('../../config/env');
const logger = require('../../utils/logger');

/**
 * Hostinger media driver, over HTTP (STORAGE_DRIVER=hostinger-http).
 *
 * The fallback to `hostinger` (direct disk writes). Use this when the API does
 * NOT run inside the same Hostinger account as the media site — or when it
 * does but cannot write to the media folder — because then the only way in is
 * the small PHP receiver (hostinger/media/public_html/_upload/index.php) that
 * writes into folders the web server serves as static files:
 *
 *   admin → this API → HTTPS POST (HMAC-signed) → media.satoys.store/_upload/
 *   public URL: ${MEDIA_PUBLIC_URL}/<folder>/<filename>
 *
 * HTTPS rather than SFTP on purpose: the API holds one secret that can only
 * write inside the media folders, not SSH credentials for the whole hosting
 * account, and needs no non-standard outbound port.
 *
 * Every request is signed over a timestamp, the action, the target and a hash
 * of the file bytes, so neither replaying a request nor swapping its file works.
 */

const IMAGE_TIMEOUT_MS = 30_000;
// A 50 MB video over a slow uplink can legitimately take a while.
const VIDEO_TIMEOUT_MS = 120_000;
const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

let ready = false;

function init() {
  if (ready) return;

  const { uploadUrl, secret, publicUrl } = media;
  const missing = [
    !uploadUrl && 'MEDIA_UPLOAD_URL',
    !secret && 'MEDIA_UPLOAD_SECRET',
    !publicUrl && 'MEDIA_PUBLIC_URL',
  ].filter(Boolean);

  if (missing.length) {
    throw new Error(
      `Hostinger (http) storage is selected but not configured. Set ${missing.join(', ')} ` +
        '(see hostinger/media/README.md).',
    );
  }
  if (secret.length < 32) {
    throw new Error('MEDIA_UPLOAD_SECRET must be at least 32 characters.');
  }
  for (const [name, value] of [['MEDIA_UPLOAD_URL', uploadUrl], ['MEDIA_PUBLIC_URL', publicUrl]]) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`${name} is not a valid URL: ${value}`);
    }
    // A plain-http receiver would put the signed request — and every file —
    // on the wire unencrypted. Only localhost (development) is exempt.
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      throw new Error(`${name} must use https`);
    }
  }

  ready = true;
  logger.info('Hostinger (http) storage ready', { publicUrl });

  // Reachability is reported, not enforced: a hosting blip at boot should not
  // take the whole API down when only uploads depend on it.
  ping().catch((error) =>
    logger.warn('Hostinger media receiver did not answer the startup check', {
      message: error.message,
    }),
  );
}

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/** Headers for one request. Must mirror the receiver's signature check exactly. */
function signedHeaders({ action, folder = '', filename = '', fileHash = '' }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto
    .createHmac('sha256', media.secret)
    .update([timestamp, action, folder, filename, fileHash].join('\n'))
    .digest('hex');
  return { 'X-Media-Timestamp': timestamp, 'X-Media-Signature': signature };
}

/** An error carrying the receiver's status and code, for the callers to map. */
function receiverError(status, body, fallback) {
  const error = new Error(body?.error?.message || fallback || `Media receiver responded ${status}`);
  error.status = status;
  error.receiverCode = body?.error?.code;
  return error;
}

/**
 * One signed POST. The form is rebuilt per attempt — a FormData body is a
 * stream and cannot be sent twice.
 */
async function send({ action, folder, filename, buffer, mimeType, timeoutMs = IMAGE_TIMEOUT_MS }) {
  const form = new FormData();
  form.append('action', action);
  if (folder) form.append('folder', folder);
  if (filename) form.append('filename', filename);
  if (buffer) form.append('file', new Blob([buffer], { type: mimeType }), filename);

  const headers = signedHeaders({
    action,
    folder,
    filename,
    fileHash: buffer ? sha256(buffer) : '',
  });

  const res = await fetch(media.uploadUrl, {
    method: 'POST',
    headers,
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 204) return { status: 204, body: null };

  const body = await res.json().catch(() => null);
  if (!res.ok) throw receiverError(res.status, body);
  return { status: res.status, body };
}

/**
 * Retries once on a network failure or a 5xx — shared hosting does hiccup —
 * but never on a 4xx, which is a real refusal that would fail again.
 */
async function sendWithRetry(args) {
  try {
    return await send(args);
  } catch (error) {
    const transient = !error.status || error.status >= 500;
    if (!transient) throw error;
    logger.warn('Media receiver request failed, retrying once', {
      action: args.action,
      message: error.message,
    });
    try {
      return await send(args);
    } catch (retryError) {
      // The first attempt may have written the file before its response was
      // lost. Names are unique per upload, so a 409 on the retry means it landed.
      if (args.action === 'save' && retryError.status === 409) return { status: 201, body: null };
      throw retryError;
    }
  }
}

const keyFor = (folder, filename) => `${folder}/${filename}`;
const urlFor = (key) => `${media.publicUrl}/${key}`;

async function save({ folder, filename, buffer, mimeType }) {
  init();

  try {
    await sendWithRetry({
      action: 'save',
      folder,
      filename,
      buffer,
      mimeType,
      timeoutMs: VIDEO_EXT.test(filename) ? VIDEO_TIMEOUT_MS : IMAGE_TIMEOUT_MS,
    });
  } catch (error) {
    // A 413 here means the host's PHP limits are lower than ours — worth
    // saying plainly, since the admin would otherwise see a generic failure.
    if (error.status === 413) {
      error.message = `The media host refused the file as too large: ${error.message}`;
    }
    throw error;
  }

  const key = keyFor(folder, filename);
  return { url: urlFor(key), key };
}

async function remove({ folder, filename }) {
  init();

  try {
    await sendWithRetry({ action: 'delete', folder, filename });
  } catch (error) {
    // Normalised so the controller treats "gone" and "bad name" the same
    // across drivers.
    if (error.status === 404) {
      const missing = new Error('File not found');
      missing.code = 'ENOENT';
      throw missing;
    }
    if (error.status === 400 && error.receiverCode === 'INVALID_PATH') {
      const invalid = new Error('Invalid path');
      invalid.code = 'EINVALIDPATH';
      throw invalid;
    }
    throw error;
  }
}

async function list(folder) {
  init();

  const { body } = await sendWithRetry({ action: 'list', folder });
  return (body?.data || []).map((f) => {
    const key = keyFor(folder, f.filename);
    return {
      url: urlFor(key),
      key,
      filename: f.filename,
      size: f.size,
      uploadedAt: f.uploadedAt,
    };
  });
}

async function ping() {
  const { body } = await send({ action: 'ping', timeoutMs: 10_000 });
  return body?.data;
}

module.exports = { name: 'hostinger-http', save, remove, list, init, ping };
