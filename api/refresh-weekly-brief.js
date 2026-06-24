import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import {
  buildWeeklyBriefPackage,
  persistWeeklyBriefToKv,
  resolveWeeklyBriefIssueDate,
} from '../weekly-brief.lib.js';

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

  const secrets = [process.env.CRON_SECRET, process.env.WEEKLY_BRIEF_BUILD_SECRET]
    .filter((s) => s != null && String(s).trim() !== '');

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

function parseTemplateOnly(req) {
  return String(req.query?.template_only || '').toLowerCase() === '1'
    || String(req.query?.template_only || '').toLowerCase() === 'true';
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

  const templateOnly = parseTemplateOnly(req);
  const issueDate = resolveWeeklyBriefIssueDate();

  try {
    const { factSheet, manifest, generator, llmError } = await buildWeeklyBriefPackage(kv, {
      issueDate,
      templateOnly,
    });

    const record = await persistWeeklyBriefToKv(kv, {
      manifest,
      generator,
      llmError,
    });

    console.log(
      `[refresh-weekly-brief] issue=${manifest.issue_date} generator=${generator} lead=${factSheet.lead_story?.name || 'none'} source=${auth.source}`,
    );

    return res.status(200).json({
      ok: true,
      saved_at: record.saved_at,
      issue_date: manifest.issue_date,
      generator,
      llm_error: llmError,
      lead_story: factSheet.lead_story?.name || null,
      manifest,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[refresh-weekly-brief] failed:', message);
    return res.status(500).json({ ok: false, error: message });
  }
}
