import { kv } from '@vercel/kv';
import {
  authorizeNewsCronRequest,
  refreshAllDestinationNewsCache,
  rejectUnknownQueryParams,
  scheduleNewsRefreshContinuation,
} from '../news-context.lib.js';

function parseForce(req) {
  const raw = String(req.query?.force ?? '').toLowerCase();
  return raw === '1' || raw === 'true';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (process.env.NEWS_CONTEXT_ENABLED !== 'true') {
    return res.status(403).json({ ok: false, error: 'News context refresh is disabled' });
  }

  const auth = authorizeNewsCronRequest(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const unknownParamError = rejectUnknownQueryParams(req, ['continue', 'force']);
  if (unknownParamError) {
    return res.status(400).json({ ok: false, error: unknownParamError.error });
  }

  const force = parseForce(req);

  try {
    const result = await refreshAllDestinationNewsCache(kv, { force });

    if (result.skipped) {
      console.log(
        `[refresh-all-destination-news] up to date reason=${result.reason} snapshot=${result.source_saved_at} source=${auth.source}`,
      );
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: result.reason,
        source_saved_at: result.source_saved_at,
        today_date: result.today_date,
        completed: result.completed,
      });
    }

    if (!result.ok) {
      if (result.error === 'lock_contended') {
        console.log(
          `[refresh-all-destination-news] lock contended; another batch is running source=${auth.source}`,
        );
        return res.status(409).json({
          ok: false,
          error: result.error,
          retry: true,
        });
      }

      console.error(
        `[refresh-all-destination-news] batch failed (${result.error}); keeping prior cached news. source=${auth.source}`,
      );
      return res.status(200).json({
        ok: false,
        error: result.error,
        source_saved_at: result.source_saved_at,
        today_date: result.today_date,
      });
    }

    console.log(
      `[refresh-all-destination-news] batch completed=${result.completed} pending=${result.pending_remaining} attempted=${result.attempted} publishable=${result.publishable_count} snapshot=${result.source_saved_at} source=${auth.source}`,
    );

    if (!result.completed && result.pending_remaining > 0) {
      scheduleNewsRefreshContinuation(req);
    }

    return res.status(200).json({
      ok: true,
      run_id: result.run_id,
      completed: result.completed,
      pending_remaining: result.pending_remaining,
      source_saved_at: result.source_saved_at,
      today_date: result.today_date,
      attempted: result.attempted,
      publishable_count: result.publishable_count,
      rejected_count: result.rejected_count,
      failed_count: result.failed_count,
      skipped_count: result.skipped_count,
      duration_ms: result.duration_ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[refresh-all-destination-news] failed:', message);
    return res.status(500).json({ ok: false, error: message });
  }
}
