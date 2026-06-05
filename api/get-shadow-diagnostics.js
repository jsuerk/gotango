import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import { SHADOW_DESTINATIONS } from '../shadow-destinations.config.js';

const SHADOW_IDS = new Set(SHADOW_DESTINATIONS.map((d) => d.id));

function hasQuerySecret(req) {
  const q = req.query || {};
  const keys = ['secret', 'token', 'authorization', 'auth', 'api_key', 'apikey'];
  return keys.some((k) => q[k] != null && String(q[k]).trim() !== '');
}

function authorizeRequest(req) {
  if (hasQuerySecret(req)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  const expected = process.env.SHADOW_FETCH_SECRET;
  if (!expected || !String(expected).trim()) {
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
  const expectedBuf = Buffer.from(String(expected).trim());
  const providedBuf = Buffer.from(provided);

  if (expectedBuf.length !== providedBuf.length) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  if (!crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true };
}

function validateDestinationId(raw) {
  if (raw == null || String(raw).trim() === '') return { id: null };
  const id = String(raw).trim();
  if (!SHADOW_IDS.has(id)) {
    return { error: 'Unknown shadow destination id.' };
  }
  return { id };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const auth = authorizeRequest(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const idResult = validateDestinationId(req.query?.id);
  if (idResult.error) {
    return res.status(400).json({ ok: false, error: idResult.error });
  }

  try {
    if (!idResult.id) {
      const [meta, latest, runs] = await Promise.all([
        kv.get('gotango:shadow:meta'),
        kv.get('gotango:shadow:latest'),
        kv.lrange('gotango:shadow:runs', 0, 29),
      ]);

      return res.status(200).json({
        ok: true,
        meta: meta ?? null,
        latest: latest ?? null,
        runs: Array.isArray(runs) ? runs.slice(0, 30) : [],
      });
    }

    const [diagnostics, history] = await Promise.all([
      kv.get(`gotango:shadow:diagnostics:${idResult.id}`),
      kv.lrange(`gotango:shadow:history:${idResult.id}`, 0, 6),
    ]);

    return res.status(200).json({
      ok: true,
      id: idResult.id,
      diagnostics: diagnostics ?? null,
      history: Array.isArray(history) ? history.slice(0, 7) : [],
    });
  } catch (err) {
    console.error('[get-shadow-diagnostics] read failed:', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
