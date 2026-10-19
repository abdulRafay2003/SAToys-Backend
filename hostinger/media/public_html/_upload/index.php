<?php
/**
 * SA Toys media receiver.
 *
 * Runs on the Hostinger hosting plan behind https://media.satoys.store/_upload/
 * and is called only by the API (src/services/storage/hostinger.js) — never by a
 * browser. It stores, deletes and lists files in the media folders that sit
 * beside this one, which the web server then serves as plain static files.
 *
 * Every request is signed with a shared secret (HMAC-SHA256 over a timestamp,
 * the action, the target and a hash of the file), so the URL being public
 * grants nothing on its own. The API already validates uploads; everything is
 * re-checked here because this script is the thing actually writing to disk.
 *
 * Protocol — all POST, multipart/form-data:
 *   action=save    folder, filename, file   → 201 {key, size}  (the API builds the public URL)
 *   action=delete  folder, filename         → 204, or 404 if absent
 *   action=list    folder                   → 200 [{filename, size, uploadedAt}]
 *   action=ping                             → 200 {ok: true}
 * Headers: X-Media-Timestamp (unix seconds), X-Media-Signature (hex HMAC of
 *   "<timestamp>\n<action>\n<folder>\n<filename>\n<sha256 of file bytes, or ''>")
 */

declare(strict_types=1);

// --- Configuration -----------------------------------------------------------

/**
 * Lives outside public_html, so it can never be served even if PHP handling
 * were misconfigured. See media-config.example.php.
 */
$configFile = dirname(__DIR__, 2) . '/media-config.php';

const FOLDERS = ['products', 'categories', 'brands', 'collections', 'banners', 'misc'];

/**
 * Extension → acceptable sniffed MIME types. The sniffed type, not the one the
 * client declared, is what decides — a PHP script renamed to .jpg fails here.
 *
 * AVIF is allowed `application/octet-stream` because older libmagic builds
 * (common on shared hosts) do not recognise it yet.
 */
const TYPES = [
    'jpg'  => ['image/jpeg'],
    'jpeg' => ['image/jpeg'],
    'png'  => ['image/png'],
    'webp' => ['image/webp'],
    'avif' => ['image/avif', 'image/heif', 'application/octet-stream'],
    'gif'  => ['image/gif'],
    'svg'  => ['image/svg+xml', 'image/svg', 'text/xml', 'application/xml'],
    'mp4'  => ['video/mp4'],
    'webm' => ['video/webm'],
    'mov'  => ['video/quicktime'],
];

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'];

/** The exact shape the API generates: <ms timestamp>-<12 hex>.<ext>. */
const FILENAME_PATTERN = '/^\d{10,16}-[a-f0-9]{12}\.(jpe?g|png|webp|avif|gif|svg|mp4|webm|mov)$/';

/** Requests further than this from the server clock are refused, so a captured request cannot be replayed later. */
const MAX_CLOCK_SKEW_SECONDS = 300;

// --- Helpers -----------------------------------------------------------------

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, $data = null): void
{
    http_response_code($status);
    if ($status === 204) {
        exit;
    }
    header('Content-Type: application/json');
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $message, string $code): void
{
    respond($status, ['success' => false, 'error' => ['message' => $message, 'code' => $code]]);
}

function field(string $name): string
{
    $value = $_POST[$name] ?? '';
    return is_string($value) ? trim($value) : '';
}

/** Media root: the public_html that holds the folders and this script's directory. */
function mediaRoot(): string
{
    return dirname(__DIR__);
}

function folderPath(string $folder): string
{
    return mediaRoot() . DIRECTORY_SEPARATOR . $folder;
}

function extensionOf(string $filename): string
{
    return strtolower(pathinfo($filename, PATHINFO_EXTENSION));
}

// --- Gatekeeping -------------------------------------------------------------

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    fail(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}

if (!is_file($configFile)) {
    fail(500, 'Receiver is not configured', 'NOT_CONFIGURED');
}

$config = require $configFile;
$secret = is_array($config) ? (string) ($config['secret'] ?? '') : '';
if (strlen($secret) < 32) {
    fail(500, 'Receiver secret is missing or too short', 'NOT_CONFIGURED');
}

$maxImageBytes = (int) ($config['max_image_bytes'] ?? 5 * 1024 * 1024);
$maxVideoBytes = (int) ($config['max_video_bytes'] ?? 50 * 1024 * 1024);

/**
 * A body larger than post_max_size arrives with $_POST and $_FILES both empty,
 * which would otherwise read as a confusing "unknown action".
 */
if (empty($_POST) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    fail(413, 'Request is larger than the server accepts', 'TOO_LARGE');
}

$action = field('action');
$folder = field('folder');
$filename = field('filename');

$timestamp = (string) ($_SERVER['HTTP_X_MEDIA_TIMESTAMP'] ?? '');
$signature = strtolower((string) ($_SERVER['HTTP_X_MEDIA_SIGNATURE'] ?? ''));

if (!ctype_digit($timestamp) || abs(time() - (int) $timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    fail(401, 'Missing or expired timestamp', 'UNAUTHENTICATED');
}

$file = $_FILES['file'] ?? null;
$fileHash = '';
if ($action === 'save' && is_array($file) && ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
    $fileHash = (string) hash_file('sha256', $file['tmp_name']);
}

$expected = hash_hmac('sha256', implode("\n", [$timestamp, $action, $folder, $filename, $fileHash]), $secret);
if ($signature === '' || !hash_equals($expected, $signature)) {
    fail(401, 'Invalid signature', 'UNAUTHENTICATED');
}

// --- Actions -----------------------------------------------------------------

if ($action === 'ping') {
    respond(200, ['success' => true, 'data' => ['ok' => true, 'time' => time()]]);
}

if (!in_array($folder, FOLDERS, true)) {
    fail(400, 'Unknown folder', 'INVALID_FOLDER');
}

if ($action === 'list') {
    $dir = folderPath($folder);
    $items = [];
    if (is_dir($dir)) {
        foreach (scandir($dir) ?: [] as $name) {
            if (!preg_match(FILENAME_PATTERN, $name)) {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $name;
            $items[] = [
                'filename' => $name,
                'size' => (int) filesize($path),
                'uploadedAt' => gmdate('Y-m-d\TH:i:s\Z', (int) filemtime($path)),
            ];
        }
    }
    respond(200, ['success' => true, 'data' => $items]);
}

// Both remaining actions name a single file, so the name is checked once here.
// The pattern admits no slashes or dots beyond the extension, so path
// traversal is impossible by construction rather than by sanitising.
if (!preg_match(FILENAME_PATTERN, $filename)) {
    fail(400, 'Invalid filename', 'INVALID_PATH');
}

$target = folderPath($folder) . DIRECTORY_SEPARATOR . $filename;

if ($action === 'delete') {
    if (!is_file($target)) {
        fail(404, 'File not found', 'NOT_FOUND');
    }
    if (!unlink($target)) {
        fail(500, 'Could not delete the file', 'DELETE_FAILED');
    }
    respond(204);
}

if ($action !== 'save') {
    fail(400, 'Unknown action', 'UNKNOWN_ACTION');
}

if (!is_array($file)) {
    fail(400, 'No file was uploaded', 'NO_FILE');
}

$uploadError = $file['error'] ?? UPLOAD_ERR_NO_FILE;
if ($uploadError === UPLOAD_ERR_INI_SIZE || $uploadError === UPLOAD_ERR_FORM_SIZE) {
    fail(413, 'File is larger than the server accepts', 'TOO_LARGE');
}
if ($uploadError !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
    fail(400, 'Upload failed', 'UPLOAD_FAILED');
}

$extension = extensionOf($filename);
$size = (int) $file['size'];
$limit = in_array($extension, VIDEO_EXTENSIONS, true) ? $maxVideoBytes : $maxImageBytes;
if ($size <= 0) {
    fail(400, 'The file is empty', 'EMPTY_FILE');
}
if ($size > $limit) {
    fail(413, 'File is too large', 'TOO_LARGE');
}

$sniffed = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: '';
if (!in_array($sniffed, TYPES[$extension] ?? [], true)) {
    fail(400, "File content ($sniffed) does not match .$extension", 'TYPE_MISMATCH');
}

$dir = folderPath($folder);
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    fail(500, 'Could not create the folder', 'WRITE_FAILED');
}

// Names are unique per upload, so an existing file means a retried request
// whose first attempt already landed — never overwrite, just report it.
if (file_exists($target)) {
    fail(409, 'A file with that name already exists', 'CONFLICT');
}

// Write under a dotfile name first, then rename: a reader can never fetch a
// half-written file, and the rename is atomic on the same filesystem.
$temp = $dir . DIRECTORY_SEPARATOR . '.tmp-' . bin2hex(random_bytes(8));
if (!move_uploaded_file($file['tmp_name'], $temp)) {
    fail(500, 'Could not store the file', 'WRITE_FAILED');
}
chmod($temp, 0644);
if (!rename($temp, $target)) {
    @unlink($temp);
    fail(500, 'Could not store the file', 'WRITE_FAILED');
}

respond(201, [
    'success' => true,
    'data' => ['key' => "$folder/$filename", 'size' => $size],
]);
