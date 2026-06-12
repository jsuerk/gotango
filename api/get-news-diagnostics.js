import { kv } from '@vercel/kv';
import { DESTINATION_NEWS_DESTINATION_IDS } from '../news-context.config.js';
import {
  NEWS_KV_KEYS,
  authorizeNewsRequest,
  buildConfigSafeIdentity,
  getDestinationNewsConfigById,
  isDestinationNewsId,
  parseDestinationNewsId,
  rejectUnknownQueryParams,
} from '../news-context.lib.js';

function findLatestEntryForId(latest, destinationId) {
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

  const auth = authorizeNewsRequest(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const unknownParamError = rejectUnknownQueryParams(req, ['id']);
  if (unknownParamError) {
    return res.status(400).json({ ok: false, error: unknownParamError.error });
  }

  const idResult = parseDestinationNewsId(req.query?.id);
  if (idResult.error) {
    return res.status(400).json({ ok: false, error: idResult.error });
  }

  try {
    if (!idResult.id) {
      const diagnosticsKeys = DESTINATION_NEWS_DESTINATION_IDS.map((id) =>
        NEWS_KV_KEYS.diagnostics(id),
      );
      const [meta, latest, runs, ...diagnosticsValues] = await Promise.all([
        kv.get(NEWS_KV_KEYS.meta),
        kv.get(NEWS_KV_KEYS.latest),
        kv.lrange(NEWS_KV_KEYS.runs, 0, 29),
        ...diagnosticsKeys.map((key) => kv.get(key)),
      ]);

      const diagnostics = {};
      for (let i = 0; i < DESTINATION_NEWS_DESTINATION_IDS.length; i += 1) {
        diagnostics[DESTINATION_NEWS_DESTINATION_IDS[i]] = diagnosticsValues[i] ?? null;
      }

      return res.status(200).json({
        ok: true,
        meta: meta ?? null,
        latest: latest ?? null,
        runs: Array.isArray(runs) ? runs.slice(0, 30) : [],
        diagnostics,
      });
    }

    const config = getDestinationNewsConfigById(idResult.id);
    if (!config || !isDestinationNewsId(idResult.id)) {
      return res.status(400).json({ ok: false, error: 'Unknown destination id.' });
    }

    const [diagnostics, latest] = await Promise.all([
      kv.get(NEWS_KV_KEYS.diagnostics(idResult.id)),
      kv.get(NEWS_KV_KEYS.latest),
    ]);

    return res.status(200).json({
      ok: true,
      destination: buildConfigSafeIdentity(config),
      diagnostics: diagnostics ?? null,
      latest_entry: findLatestEntryForId(latest, idResult.id),
    });
  } catch (err) {
    console.error('[get-news-diagnostics] read failed:', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
