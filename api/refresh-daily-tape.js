import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import {
  buildDailyTapePackage,
  persistDailyTapeToKv,
} from '../daily-tape.lib.js';

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

  try {
    const { input, result } = await buildDailyTapePackage(kv);

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
        heating_count: input.heatingCount,
        cooling_count: input.coolingCount,
      });
    }

    const record = await persistDailyTapeToKv(kv, {
      brief: result.brief,
      generator: result.generator,
      llmError: result.llm_error,
      todayDate: input.todayDate,
    });

    console.log(
      `[refresh-daily-tape] saved verdict=${result.brief.verdict} generator=${result.generator} heating=${input.heatingCount} cooling=${input.coolingCount} source=${auth.source}`,
    );

    return res.status(200).json({
      ok: true,
      saved_at: record.saved_at,
      today_date: record.today_date,
      generator: result.generator,
      verdict: result.brief.verdict,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[refresh-daily-tape] failed:', message);
    return res.status(500).json({ ok: false, error: message });
  }
}
