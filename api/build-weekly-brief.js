import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import { DESTINATIONS } from '../destinations.config.js';
import {
  computeGoTangoScoreResponse,
} from '../gotango-score-v2.lib.js';
import {
  buildWeeklyBriefFactSheet,
  generateWeeklyBriefManifest,
  serializeWeeklyBriefConfig,
} from '../weekly-brief.lib.js';

const LATEST_KEY = 'gotango:arrivals:latest';
const HISTORY_KEY = 'gotango:arrivals:history';
const PUBLIC_DESTINATIONS = DESTINATIONS.map((d) => ({ id: d.id, name: d.name }));

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
  if (!raw || typeof raw !== 'string') return new Date();
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return new Date();
  return new Date(`${trimmed}T12:00:00Z`);
}

async function loadBriefSourceData() {
  const [latest, rawHistory, meta] = await Promise.all([
    kv.get(LATEST_KEY),
    kv.lrange(HISTORY_KEY, 0, -1),
    kv.get('gotango:arrivals:meta'),
  ]);

  if (latest == null) {
    throw new Error('No cached arrivals data available yet.');
  }

  const historyList = Array.isArray(rawHistory) ? rawHistory : [];
  const scoreResponse = computeGoTangoScoreResponse({
    latestPayload: latest,
    historyList,
    publicDestinations: PUBLIC_DESTINATIONS,
  });

  return {
    arrivalsPayload: {
      ...latest,
      saved_at: latest.saved_at || meta?.saved_at || null,
    },
    homepage: latest.homepage || null,
    scoreResponse,
  };
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
    const { arrivalsPayload, homepage, scoreResponse } = await loadBriefSourceData();
    const factSheet = buildWeeklyBriefFactSheet({
      arrivalsPayload,
      scoreResponse,
      homepage,
      issueDate,
    });

    const { manifest, generator, llmError } = await generateWeeklyBriefManifest({
      factSheet,
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
