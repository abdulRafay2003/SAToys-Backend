<?php
/**
 * Copy to `media-config.php` in the SAME directory as public_html — i.e. one
 * level ABOVE the web root, so it can never be served — and fill in the secret.
 *
 *   domains/media.satoys.store/
 *     media-config.php      ← here
 *     public_html/
 *       _upload/index.php
 *
 * The secret must equal MEDIA_UPLOAD_SECRET on the API. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
return [
    'secret' => 'replace_with_64_hex_characters',

    // Mirror the API's UPLOAD_MAX_FILE_SIZE_MB / UPLOAD_MAX_VIDEO_SIZE_MB.
    'max_image_bytes' => 5 * 1024 * 1024,
    'max_video_bytes' => 50 * 1024 * 1024,
];
