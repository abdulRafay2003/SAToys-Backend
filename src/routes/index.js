const express = require('express');

/**
 * Versioned mount point. Everything hangs off /api/v1 so a future breaking
 * change can ship as /api/v2 alongside, rather than as a flag day for two
 * frontends at once.
 */
const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/account', require('./account'));
router.use('/admin', require('./admin'));

// Public storefront routes are mounted last: they have the loosest paths
// (/:slug patterns), so a more specific prefix must get first refusal.
router.use('/', require('./public'));

module.exports = router;
