const { z, objectId } = require('./common');
const C = require('../config/constants');

/** Public submission. `verified` and `status` are decided server-side, never sent. */
const createReview = z.object({
  productId: objectId,
  author: z.string().trim().min(1, 'Tell us your name').max(80),
  email: z.email('Enter a valid email address').optional(),
  rating: z.number().int().min(1, 'Pick a rating').max(5),
  title: z.string().trim().min(1, 'Give your review a title').max(140),
  body: z.string().trim().min(10, 'Tell us a little more').max(4000),
  boughtFor: z.string().trim().max(120).nullable().optional(),
});

const moderateReview = z.object({
  status: z.enum(C.MODERATION_STATUSES),
  moderationNote: z.string().trim().max(500).optional(),
});

const reviewQuery = z.object({
  sort: z.enum(['recent', 'helpful', 'rating']).default('helpful'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
});

module.exports = { createReview, moderateReview, reviewQuery };
