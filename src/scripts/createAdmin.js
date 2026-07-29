require('../config/env');

const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const { User, Role } = require('../models');
const logger = require('../utils/logger');

/**
 * Creates the first super-admin.
 *
 * Credentials are prompted for rather than taken as CLI arguments, because
 * arguments land in shell history and in the process list. Env vars are
 * accepted for non-interactive use (CI, container start).
 */
async function run() {
  await connectDB();

  const role = await Role.findOne({ slug: 'super-admin' });
  if (!role) {
    throw new Error('No super-admin role found. Run `npm run seed:roles` first.');
  }

  let { ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ADMIN_NAME: firstName } = process.env;

  if (!email || !password) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    firstName = firstName || (await rl.question('First name: '));
    email = email || (await rl.question('Email: '));
    password = password || (await rl.question('Password (min 8 chars): '));
    rl.close();
  }

  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    existing.role = role._id;
    existing.password = password;
    existing.isActive = true;
    await existing.save();
    logger.info(`Existing account promoted to super-admin: ${existing.email}`);
  } else {
    const user = await User.create({
      firstName: firstName || 'Admin',
      email: email.toLowerCase(),
      password,
      role: role._id,
      isEmailVerified: true,
    });
    logger.info(`Super-admin created: ${user.email}`);
  }

  await mongoose.connection.close();
}

run().catch(async (error) => {
  logger.error(error.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
