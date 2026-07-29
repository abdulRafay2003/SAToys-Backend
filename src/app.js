const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { corsOrigins, isProd } = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const logger = require('./utils/logger');

const app = express();

/** Behind a proxy the client IP comes from X-Forwarded-For; rate limiting needs it. */
if (isProd) app.set('trust proxy', 1);

app.use(
  helmet({
    // Uploaded images are served from this origin and embedded by two others.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  }),
);

/**
 * An allow-list, not `cors()`. The storefront and admin are the only browser
 * clients; anything else has no business sending credentialed requests.
 * Requests with no Origin (curl, server-to-server, health checks) are allowed.
 */
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} is not allowed`));
    },
    credentials: true,
  }),
);

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use(
  morgan(isProd ? 'combined' : 'dev', {
    stream: { write: (line) => logger.info(line.trim()) },
    skip: (req) => req.path === '/api/health',
  }),
);

/** Blanket ceiling. The auth routes add a much tighter limit of their own. */
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { message: 'Too many requests', code: 'RATE_LIMITED' } },
  }),
);

// Uploaded media. immutable because filenames are content-unique.
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'), {
    maxAge: isProd ? '30d' : 0,
    immutable: isProd,
    // Never let a stray .html in the uploads tree execute in this origin.
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }),
);

app.get('/api/health', (req, res) =>
  res.status(200).json({
    success: true,
    data: { status: 'ok', uptime: Math.round(process.uptime()), time: new Date().toISOString() },
  }),
);

app.use('/api/v1', routes);

// API documentation.
require('./docs/mount')(app);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
