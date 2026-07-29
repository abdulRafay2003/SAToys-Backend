const { revalidate: config } = require('../config/env');
const logger = require('../utils/logger');

/**
 * Tells the storefront to drop cached data for a set of tags.
 *
 * Fire-and-forget on purpose. The admin write has already succeeded by the time
 * this runs, so a storefront that is down, slow, or misconfigured must not turn
 * a successful save into a failed request. Worst case the storefront serves
 * slightly stale data until its own 60-second floor expires.
 *
 * Unconfigured is a normal state, not an error — it just means the storefront
 * falls back to time-based revalidation.
 */
function revalidateTags(tags) {
  if (!config.url || !config.secret) return;
  if (!tags?.length) return;

  const controller = new AbortController();
  // A hung storefront must not leave sockets open behind every admin write.
  const timer = setTimeout(() => controller.abort(), 3000);

  fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-revalidate-secret': config.secret,
    },
    body: JSON.stringify({ tags }),
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) logger.warn('Revalidation rejected', { status: res.status, tags });
    })
    .catch((error) => {
      if (error.name === 'AbortError') {
        logger.warn('Revalidation timed out', { tags });
      } else {
        logger.warn('Revalidation failed', { message: error.message, tags });
      }
    })
    .finally(() => clearTimeout(timer));
}

/** Tag names, mirrored from the storefront's `lib/api.ts` TAGS. */
const TAGS = {
  products: 'products',
  categories: 'categories',
  brands: 'brands',
  collections: 'collections',
  reviews: 'reviews',
  content: 'content',
  nav: 'nav',
  settings: 'settings',
  home: 'home',
  banners: 'banners',
};

module.exports = { revalidateTags, TAGS };
