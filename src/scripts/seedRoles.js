require('../config/env');

const mongoose = require('mongoose');
const connectDB = require('../config/database');
const { Role, Settings, NavMenu } = require('../models');
const { SYSTEM_ROLES } = require('../config/permissions');
const logger = require('../utils/logger');

/**
 * Bootstraps the rows the application cannot function without: the four system
 * roles, the settings singleton, and empty nav menus for each location.
 *
 * This is *not* content seeding — the catalogue starts empty by design. It is
 * idempotent, so it is safe to re-run after adding a permission.
 */
async function run() {
  await connectDB();

  for (const role of SYSTEM_ROLES) {
    await Role.findOneAndUpdate(
      { slug: role.slug },
      { $set: role },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    logger.info(`role ready: ${role.slug} (${role.permissions.length} permissions)`);
  }

  const settings = await Settings.load();
  logger.info(`settings singleton ready: ${settings.site.name}`);

  for (const location of ['primary', 'shop-mega', 'collections-panel', 'footer']) {
    await NavMenu.findOneAndUpdate(
      { location },
      { $setOnInsert: { location, columns: [], links: [] } },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }
  logger.info('nav menus ready: primary, shop-mega, collections-panel, footer');

  await mongoose.connection.close();
  logger.info('done');
}

run().catch(async (error) => {
  logger.error(error.message, { stack: error.stack });
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
