const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/env');

/**
 * Signs a session token.
 *
 * Reads through `config/env` rather than `process.env` directly. That is not
 * stylistic: the config layer applies the `'7d'` default for `JWT_EXPIRE` and
 * fails fast if `JWT_SECRET` is absent. Reading the raw environment here
 * skipped both, so a deploy without `JWT_EXPIRE` set booted happily and then
 * threw `"expiresIn" should be a number of seconds or string representing a
 * timespan` on the first successful login — after the password had already
 * been verified, which made it look like a database problem.
 */
const generateToken = (id) =>
  jwt.sign({ id }, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });

module.exports = generateToken;
