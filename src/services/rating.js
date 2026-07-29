const { Product, Review } = require('../models');

/**
 * Ratings are denormalised onto Product so a 24-card grid does not run 24
 * aggregations — but that means they must be recomputed on every event that
 * changes the approved review set.
 *
 * Called from the review controller on create (if auto-approved), approve,
 * reject, and delete. This is the mechanism behind "review approval immediately
 * affects what users see".
 */
async function recomputeProductRating(productId) {
  const rows = await Review.aggregate([
    { $match: { product: productId, status: 'approved' } },
    { $group: { _id: '$rating', n: { $sum: 1 } } },
  ]);

  const distribution = [0, 0, 0, 0, 0];
  let total = 0;
  let sum = 0;

  for (const { _id: stars, n } of rows) {
    if (stars >= 1 && stars <= 5) {
      distribution[stars - 1] = n;
      total += n;
      sum += stars * n;
    }
  }

  const average = total ? Number((sum / total).toFixed(2)) : 0;

  await Product.updateOne(
    { _id: productId },
    { $set: { 'rating.average': average, 'rating.count': total, 'rating.distribution': distribution } },
  );

  return { average, count: total, distribution };
}

module.exports = { recomputeProductRating };
