const nodemailer = require('nodemailer');
const { mail } = require('../config/env');
const logger = require('./logger');

/**
 * The transporter is created once. Rebuilding it per message reopens a TLS
 * connection every time, which is slow and trips rate limits on shared SMTP.
 */
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.port === 465,
      auth: { user: mail.user, pass: mail.pass },
    });
  }
  return transporter;
};

/**
 * Send an email.
 *
 * Failures are logged, not thrown: a customer's order should not fail because
 * the confirmation email bounced. Callers that genuinely need delivery
 * confirmation can check the returned flag.
 *
 * @param {{to: string, subject: string, html: string, text?: string}} options
 * @returns {Promise<boolean>} whether it was actually sent
 */
async function sendEmail({ to, subject, html, text }) {
  if (!mail.enabled) {
    logger.warn('Email not configured — message not sent', { to, subject });
    return false;
  }

  try {
    const info = await getTransporter().sendMail({
      from: `${mail.fromName} <${mail.user}>`,
      to,
      subject,
      html,
      text: text || String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
    logger.info('Email sent', { to, subject, id: info.messageId });
    return true;
  } catch (error) {
    logger.error('Email failed', { to, subject, error: error.message });
    return false;
  }
}

module.exports = sendEmail;
