const { mail } = require('../config/env');
const logger = require('./logger');

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Send an email via Brevo's transactional HTTP API.
 *
 * Not SMTP — Render (like most PaaS free tiers) blocks outbound SMTP ports,
 * which left every send hanging until connection-timeout. A plain HTTPS call
 * has no such problem.
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': mail.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: mail.fromName, email: mail.fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text || String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.message || `Brevo responded ${res.status}`);
    }

    logger.info('Email sent', { to, subject, id: body.messageId });
    return true;
  } catch (error) {
    logger.error('Email failed', { to, subject, error: error.message });
    return false;
  }
}

module.exports = sendEmail;
