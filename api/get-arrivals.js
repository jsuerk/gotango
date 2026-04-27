import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('Content-Type', 'application/json');

  try {
    console.log('Reading from KV...');

    const [latest, meta] = await Promise.all([
      kv.get('gotango:arrivals:latest'),
      kv.get('gotango:arrivals:meta'),
    ]);

    if (latest == null) {
      console.log('Cache empty');
      return res.status(200).json({
        ok: false,
        error: 'No cached data available yet. The orchestrator may not have run successfully.',
        cache_status: 'empty',
      });
    }

    const n =
      Array.isArray(latest.destinations) ? latest.destinations.length : meta?.successful_count;
    if (n != null && n !== undefined) {
      console.log(`Cache hit, returning ${n} destinations`);
    } else {
      console.log('Cache hit, returning destinations');
    }

    return res.status(200).json({
      ok: true,
      cache_status: 'hit',
      meta: meta ?? null,
      data: latest,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`KV read error: ${message}`);
    return res.status(200).json({
      ok: false,
      cache_status: 'error',
      error: message,
    });
  }
}
