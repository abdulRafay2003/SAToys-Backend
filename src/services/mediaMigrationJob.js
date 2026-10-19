const os = require('os');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { revalidateTags, TAGS } = require('./revalidate');

/**
 * Runs the media migration (src/scripts/migrateMedia.js) inside the API, once.
 *
 * The destination for `STORAGE_DRIVER=hostinger` is a folder on the Hostinger
 * box, which only this process can reach — there is no shell to run the
 * script from. So the API runs it itself, at boot, when asked:
 *
 *   MEDIA_MIGRATE_ON_BOOT=firebase           copy Firebase files, rewrite URLs
 *   MEDIA_MIGRATE_ON_BOOT=firebase-dry-run   report only, nothing written
 *   MEDIA_MIGRATE_ON_BOOT=local              the same, from ./uploads
 *
 * Set the variable, redeploy, read the runtime log, remove the variable.
 *
 * Safety:
 *   • It runs in the background after the server is listening; the shop
 *     serves normally throughout.
 *   • A lock document in `jobs` stops two processes (or a restart loop) from
 *     running it at once, and a finished run with no failures is not repeated
 *     while the variable is still set.
 *   • Every copied file's old→new URL is recorded in `mediamigrationmap`, so
 *     the URL rewrite can be reversed if ever needed.
 *   • The migration itself never deletes source files and leaves any URL it
 *     could not copy untouched.
 */

const JOB_ID = 'media-migration';
const STALE_LOCK_MS = 30 * 60 * 1000;
const MODES = {
  firebase: { from: 'firebase', dryRun: false },
  'firebase-dry-run': { from: 'firebase', dryRun: true },
  local: { from: 'local', dryRun: false },
  'local-dry-run': { from: 'local', dryRun: true },
};

/** Takes the lock, or explains why not. Returns true when this process should run. */
async function acquire(jobs, mode) {
  const now = new Date();
  const owner = `${os.hostname()}:${process.pid}`;

  const existing = await jobs.findOne({ _id: JOB_ID });

  if (existing?.status === 'completed' && existing.mode === mode && existing.report?.failed === 0) {
    logger.info(
      `Media migration (${mode}) already completed at ${existing.finishedAt?.toISOString?.() || existing.finishedAt} ` +
        'with no failures — skipping. Remove MEDIA_MIGRATE_ON_BOOT.',
    );
    return false;
  }

  if (existing?.status === 'running' && now - new Date(existing.startedAt) < STALE_LOCK_MS) {
    logger.warn(`Media migration is already running (${existing.owner}) — not starting a second copy.`);
    return false;
  }

  // Conditional upsert: only one process can move the document into "running".
  const result = await jobs.updateOne(
    {
      _id: JOB_ID,
      $or: [{ status: { $ne: 'running' } }, { startedAt: { $lt: new Date(now - STALE_LOCK_MS) } }],
    },
    { $set: { status: 'running', mode, owner, startedAt: now, finishedAt: null, report: null } },
    { upsert: true },
  ).catch((error) => {
    // Duplicate key: another process inserted the lock between our read and write.
    if (error.code === 11000) return { matchedCount: 0, upsertedCount: 0 };
    throw error;
  });

  return Boolean(result.matchedCount || result.upsertedCount);
}

async function run(mode) {
  const { from, dryRun } = MODES[mode];
  const { migrate } = require('../scripts/migrateMedia');
  const db = mongoose.connection.db;
  const jobs = db.collection('jobs');
  const map = db.collection('mediamigrationmap');

  if (!(await acquire(jobs, mode))) return;

  logger.info(`Media migration started: ${from} → active storage${dryRun ? ' (DRY RUN)' : ''}`);

  try {
    const stats = await migrate(db, {
      from,
      dryRun,
      log: (line) => logger.info(`Media migration ${line.trim()}`),
      onCopied: (oldUrl, newUrl) =>
        map.updateOne({ _id: oldUrl }, { $set: { newUrl, at: new Date() } }, { upsert: true }),
    });

    const report = {
      dryRun,
      planned: stats.planned,
      copied: stats.copied,
      alreadyThere: stats.alreadyThere,
      documents: stats.documents,
      byCollection: stats.byCollection,
      missing: stats.missing.length,
      failed: stats.failed.length,
      // Enough to diagnose without bloating the document.
      missingSample: stats.missing.slice(0, 20),
      failedSample: stats.failed.slice(0, 20),
    };

    await jobs.updateOne({ _id: JOB_ID }, { $set: { status: 'completed', finishedAt: new Date(), report } });

    logger.info('Media migration finished', {
      dryRun,
      planned: report.planned,
      copied: report.copied,
      alreadyThere: report.alreadyThere,
      documents: report.documents,
      missing: report.missing,
      failed: report.failed,
    });
    for (const item of report.failedSample) logger.warn(`Media migration failed: ${item.url} — ${item.reason}`);
    for (const item of report.missingSample) logger.warn(`Media migration missing at source: ${item.url} — ${item.reason}`);

    // Pages cached with the old URLs would otherwise keep serving them for
    // up to a minute after the rewrite.
    if (!dryRun && stats.documents) revalidateTags(Object.values(TAGS));
  } catch (error) {
    logger.error(`Media migration crashed: ${error.message}`, { stack: error.stack });
    await jobs
      .updateOne({ _id: JOB_ID }, { $set: { status: 'failed', finishedAt: new Date(), error: error.message } })
      .catch(() => {});
  }
}

/** Called from server.js once Mongo is connected. Never throws. */
function maybeRunMigrationOnBoot() {
  const mode = (process.env.MEDIA_MIGRATE_ON_BOOT || '').trim();
  if (!mode) return;

  if (!MODES[mode]) {
    logger.error(`MEDIA_MIGRATE_ON_BOOT="${mode}" is not recognised — use ${Object.keys(MODES).join(', ')}`);
    return;
  }

  // Deferred so it never delays the server starting to listen.
  setImmediate(() => {
    run(mode).catch((error) => logger.error(`Media migration could not start: ${error.message}`));
  });
}

module.exports = { maybeRunMigrationOnBoot, run, acquire, MODES };
