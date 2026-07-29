const mongoose = require('mongoose');
const { mongoUri, isProd } = require('./env');
const logger = require('../utils/logger');

/**
 * Strict query filters: an unknown key in a filter object throws instead of
 * matching every document. Without it a typo'd filter silently returns the
 * whole collection, which is how a "show active products" query becomes a leak.
 */
mongoose.set('strictQuery', true);
if (!isProd) mongoose.set('debug', process.env.LOG_LEVEL === 'debug');

async function connectDB() {
  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10_000,
    });
    logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('error', (err) => logger.error(`MongoDB error: ${err.message}`));

module.exports = connectDB;
