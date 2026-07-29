const { isProd } = require('../config/env');

/**
 * Small structured logger. JSON in production so a log shipper can parse it,
 * readable lines in development. Deliberately dependency-free — a logging
 * library is not worth a transitive tree for this surface area.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? (isProd ? LEVELS.info : LEVELS.debug);

const write = (level, message, meta) => {
  if (LEVELS[level] > threshold) return;

  const stream = level === 'error' ? console.error : console.log;

  if (isProd) {
    stream(JSON.stringify({ level, message, time: new Date().toISOString(), ...meta }));
    return;
  }

  const tag = { error: '✖', warn: '▲', info: '·', debug: '⋯' }[level];
  stream(`${tag} ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`);
};

module.exports = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
};
