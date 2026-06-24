import { kv } from '@vercel/kv';
import { getWeeklyBriefFromKv } from '../weekly-brief.lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const brief = await getWeeklyBriefFromKv(kv);
    if (!brief.ok) {
      return res.status(200).json({
        ok: false,
        cache_status: 'empty',
        error: 'No weekly brief published yet.',
      });
    }

    return res.status(200).json({
      ok: true,
      cache_status: 'hit',
      saved_at: brief.saved_at,
      issue_date: brief.issue_date,
      generator: brief.generator,
      llm_error: brief.llm_error,
      manifest: brief.manifest,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[get-weekly-brief] failed:', message);
    return res.status(200).json({
      ok: false,
      cache_status: 'error',
      error: message,
    });
  }
}
