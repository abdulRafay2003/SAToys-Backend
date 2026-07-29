require('./src/config/env');

const app = require('./src/app');
const connectDB = require('./src/config/database');
const { port, env } = require('./src/config/env');
const logger = require('./src/utils/logger');

let server;

(async () => {
  await connectDB();

  server = app.listen(port, () => {
    logger.info(`LUMO API listening on :${port} (${env})`);
    logger.info(`Docs at http://localhost:${port}/api/docs`);
  });
})();

/**
 * Close the HTTP server before exiting so in-flight requests finish rather than
 * being cut mid-response.
 */
const shutdown = (signal, error) => {
  if (error) logger.error(`${signal}: ${error.message}`, { stack: error.stack });
  else logger.info(`${signal} received — shutting down`);

  if (!server) process.exit(error ? 1 : 0);

  server.close(() => process.exit(error ? 1 : 0));
  // Do not hang forever on a stuck keep-alive connection.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('unhandledRejection', (err) => shutdown('unhandledRejection', err));
process.on('uncaughtException', (err) => shutdown('uncaughtException', err));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
