import { kv } from '@vercel/kv';
import {
  GENERATOR_VERSION,
  NEWS_KV_KEYS,
  normalizeDomain,
  parseDestinationNewsId,
  rejectUnknownQueryParams,
  validateHttpsUrl,
} from '../news-context.lib.js';

export function isValidIsoTimestamp(value) {
  if (value == null || typeof value !== 'string' || value.trim() === '') return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

export function sanitizeBrowserCitations(citations) {
  if (!Array.isArray(citations)) return null;
  if (citations.length < 2 || citations.length > 3) return null;

  const seen = new Set();
  const out = [];

  for (const citation of citations) {
    const url = validateHttpsUrl(citation?.url);
    if (!url) return null;
    if (seen.has(url)) return null;
    seen.add(url);

    const domain = normalizeDomain(url);
    if (!domain) return null;

    const title =
      citation?.title != null ? String(citation.title).trim() : '';

    out.push({
      title,
      domain,
      url,
    });
  }

  if (out.length < 2 || out.length > 3) return null;
  return out;
}

export function buildBrowserSafeNewsPayload(entry, destinationId, nowIso = new Date().toISOString()) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.destination_id !== destinationId) return null;
  if (entry.publishable !== true) return null;
  if (entry.generator_version !== GENERATOR_VERSION) return null;
  if (!isValidIsoTimestamp(entry.generated_at)) return null;
  if (!isValidIsoTimestamp(entry.expires_at)) return null;

  const nowMs = Date.parse(nowIso);
  const generatedMs = Date.parse(entry.generated_at);
  const expiresMs = Date.parse(entry.expires_at);
  if (!Number.isFinite(nowMs) || !Number.isFinite(generatedMs) || !Number.isFinite(expiresMs)) {
    return null;
  }
  if (expiresMs <= nowMs) return null;
  if (typeof entry.blurb !== 'string' || entry.blurb.trim() === '') return null;

  const citations = sanitizeBrowserCitations(entry.citations);
  if (!citations) return null;

  return {
    generated_at: entry.generated_at,
    expires_at: entry.expires_at,
    blurb: entry.blurb,
    citations,
  };
}

export function findLatestEntryForId(latest, destinationId) {
  if (!latest || typeof latest !== 'object' || !Array.isArray(latest.destinations)) {
    return null;
  }
  return latest.destinations.find((entry) => entry?.destination_id === destinationId) ?? null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const unknownParamError = rejectUnknownQueryParams(req, ['id']);
  if (unknownParamError) {
    return res.status(400).json({ ok: false, error: unknownParamError.error });
  }

  const idResult = parseDestinationNewsId(req.query?.id);
  if (idResult.error) {
    return res.status(400).json({ ok: false, error: idResult.error });
  }
  if (!idResult.id) {
    return res.status(400).json({ ok: false, error: 'Missing id query parameter.' });
  }

  const destinationId = idResult.id;

  try {
    const latest = await kv.get(NEWS_KV_KEYS.latest);
    const entry = findLatestEntryForId(latest, destinationId);
    const news = buildBrowserSafeNewsPayload(entry, destinationId);

    return res.status(200).json({
      ok: true,
      destination_id: destinationId,
      news,
    });
  } catch (err) {
    console.error('[get-destination-news] read failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'Unable to load destination news.',
    });
  }
}
