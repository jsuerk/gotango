import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import {
  buildWeeklyBriefPackage,
  resolveWeeklyBriefIssueDate,
  serializeWeeklyBriefConfig,
} from '../weekly-brief.lib.js';

function timingSafeMatch(provided, expected) {
  const expectedBuf = Buffer.from(String(expected).trim());
  const providedBuf = Buffer.from(String(provided).trim());
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

function authorizeRequest(req) {
  if (process.env.VERCEL_ENV === 'preview') {
    return { ok: true };
  }

  const bypass = req.headers?.['x-vercel-protection-bypass'];
  const expectedBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass && expectedBypass && timingSafeMatch(bypass, expectedBypass)) {
    return { ok: true };
  }

  const secrets = [
    process.env.CRON_SECRET,
    process.env.WEEKLY_BRIEF_BUILD_SECRET,
    process.env.NEWS_CONTEXT_SECRET,
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

  return { ok: true };
}

function parseIssueDate(raw) {
  if (!raw || typeof raw !== 'string') return resolveWeeklyBriefIssueDate();
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return resolveWeeklyBriefIssueDate();
  return resolveWeeklyBriefIssueDate(new Date(`${trimmed}T12:00:00Z`));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Content-Type', 'application/json');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const auth = authorizeRequest(req);
  if (!auth.ok) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const issueDate = parseIssueDate(req.query?.issue_date);
  const templateOnly = String(req.query?.template_only || '').toLowerCase() === '1'
    || String(req.query?.template_only || '').toLowerCase() === 'true';
  const format = String(req.query?.format || 'json').toLowerCase();

  try {
    const { manifest, generator, llmError } = await buildWeeklyBriefPackage(kv, {
      issueDate,
      templateOnly,
    });

    if (format === 'config') {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      return res.status(200).send(serializeWeeklyBriefConfig(manifest));
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      ok: true,
      generator,
      llm_error: llmError,
      manifest,
      config: serializeWeeklyBriefConfig(manifest),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[build-weekly-brief] failed:', message);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ ok: false, error: message });
  }
}
