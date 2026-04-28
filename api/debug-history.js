import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    console.log('Reading history from KV...');
    const rawStrings = await kv.lrange('gotango:arrivals:history', 0, -1);
    const rawList = Array.isArray(rawStrings) ? rawStrings : [];
    const n = rawList.length;
    console.log(`Found ${n} history entries`);

    const entries = [];
    for (const str of rawList) {
      try {
        entries.push(JSON.parse(str));
      } catch {
        // skip malformed rows; continue with others
      }
    }

    return res.status(200).json({
      ok: true,
      count: n,
      entries,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`Error reading history: ${message}`);
    return res.status(200).json({
      ok: false,
      error: message,
    });
  }
}
