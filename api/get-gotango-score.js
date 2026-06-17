import { kv } from '@vercel/kv';
import { DESTINATIONS } from '../destinations.config.js';
import {
  computeGoTangoScoreResponse,
  GOTANGO_SCORE_VERSION,
} from '../gotango-score-v2.lib.js';

const HISTORY_KEY = 'gotango:arrivals:history';
const LATEST_KEY = 'gotango:arrivals:latest';
const PUBLIC_DESTINATIONS = DESTINATIONS.map((d) => ({ id: d.id, name: d.name }));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const [latest, rawHistory] = await Promise.all([
      kv.get(LATEST_KEY),
      kv.lrange(HISTORY_KEY, 0, -1),
    ]);

    if (latest == null) {
      return res.status(200).json({
        ok: false,
        go_tango_score_version: GOTANGO_SCORE_VERSION,
        error: 'No cached arrivals data available yet.',
        cache_status: 'empty',
      });
    }

    const historyList = Array.isArray(rawHistory) ? rawHistory : [];
    const response = computeGoTangoScoreResponse({
      latestPayload: latest,
      historyList,
      publicDestinations: PUBLIC_DESTINATIONS,
    });

    return res.status(200).json({
      ok: true,
      cache_status: 'hit',
      ...response,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[get-gotango-score] KV read error: ${message}`);
    return res.status(200).json({
      ok: false,
      go_tango_score_version: GOTANGO_SCORE_VERSION,
      error: message,
      cache_status: 'error',
    });
  }
}
