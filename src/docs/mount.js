const swaggerUi = require('swagger-ui-express');
const spec = require('./openapi');
const logger = require('../utils/logger');

/**
 * Serves the OpenAPI document and a browsable UI at /api/docs.
 *
 * The spec is hand-maintained rather than generated from JSDoc annotations:
 * annotation-driven generation drifts silently the moment someone edits a route
 * without touching its comment, and a wrong spec is worse than an absent one.
 */
module.exports = function mountDocs(app) {
  app.get('/api/openapi.json', (req, res) => res.json(spec));

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'LUMO API',
      swaggerOptions: { persistAuthorization: true, docExpansion: 'none' },
    }),
  );

  logger.debug('API docs mounted at /api/docs');
};
