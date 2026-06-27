import { kv } from '@vercel/kv';
import { getDailyTapeFromKv } from '../daily-tape.lib.js';

export default async function handler(req, res) {
  // Cache at the edge briefly; the brief only changes once a day.
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const cached = await getDailyTapeFromKv(kv);
    if (!cached.ok) {
      return res.status(200).json({
        ok: false,
        cache_status: 'empty',
        error: 'No Daily Tape published yet.',
      });
    }

    return res.status(200).json({
      ok: true,
      cache_status: 'hit',
      saved_at: cached.saved_at,
      today_date: cached.today_date,
      generator: cached.generator,
      llm_error: cached.llm_error,
      brief: cached.brief,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[get-daily-tape] read failed:', message);
    return res.status(200).json({ ok: false, cache_status: 'error', error: message });
  }
}
