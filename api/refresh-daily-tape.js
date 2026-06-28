import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import { refreshDailyTapeCache } from '../daily-tape.lib.js';

function parseForce(req) {
  const raw = String(req.query?.force ?? '').toLowerCase();
  return raw === '1' || raw === 'true';
}

function timingSafeMatch(provided, expected) {
  const expectedBuf = Buffer.from(String(expected).trim());
  const providedBuf = Buffer.from(String(provided).trim());
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

function authorizeCronRequest(req) {
  const cronHeader = req.headers?.['x-vercel-cron'] ?? req.headers?.['X-Vercel-Cron'];
  if (cronHeader === '1') {
    return { ok: true, source: 'vercel-cron' };
  }

  if (process.env.VERCEL_ENV === 'preview') {
    return { ok: true, source: 'preview' };
  }

  const bypass = req.headers?.['x-vercel-protection-bypass'];
  const expectedBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass && expectedBypass && timingSafeMatch(bypass, expectedBypass)) {
    return { ok: true, source: 'protection-bypass' };
  }

  const secrets = [
    process.env.CRON_SECRET,
    process.env.DAILY_TAPE_BUILD_SECRET,
    process.env.WEEKLY_BRIEF_BUILD_SECRET,
  ].filter((s) => s != null && String(s).trim() !== '');

  if (secrets.length === 0) {
    return { ok: false, status: 503, error: 'Service unavailable' };
  }

  const authHeader = req.headers?.authorization ?? req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  const provided = match[1].trim();
  const authorized = secrets.some((secret) => timingSafeMatch(provided, secret));
  if (!authorized) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, source: 'bearer' };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  // Default (cron) runs idempotently: it only regenerates when the arrivals
  // snapshot changed since the cached brief, acting as a safety net for the
  // inline regeneration in fetch-all-arrivals. `?force=1` always regenerates.
  const force = parseForce(req);

  try {
    const result = await refreshDailyTapeCache(kv, { force });

    if (result.skipped) {
      console.log(
        `[refresh-daily-tape] up to date for snapshot=${result.source_saved_at} source=${auth.source}`,
      );
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: result.reason,
        source_saved_at: result.source_saved_at,
        generator: result.generator,
      });
    }

    if (!result.ok) {
      // Leave any previously cached brief in place so users keep yesterday's
      // read rather than losing the section when synthesis fails.
      console.error(
        `[refresh-daily-tape] synthesis failed (${result.llm_error || result.error}); keeping prior cached brief. source=${auth.source}`,
      );
      return res.status(200).json({
        ok: false,
        error: result.error,
        llm_error: result.llm_error,
        heating_count: result.input?.heatingCount,
        cooling_count: result.input?.coolingCount,
      });
    }

    console.log(
      `[refresh-daily-tape] saved verdict=${result.brief.verdict} generator=${result.generator} heating=${result.input.heatingCount} cooling=${result.input.coolingCount} snapshot=${result.source_saved_at} source=${auth.source}`,
    );

    return res.status(200).json({
      ok: true,
      saved_at: result.record.saved_at,
      today_date: result.record.today_date,
      source_saved_at: result.source_saved_at,
      generator: result.generator,
      verdict: result.brief.verdict,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[refresh-daily-tape] failed:', message);
    return res.status(500).json({ ok: false, error: message });
  }
}
