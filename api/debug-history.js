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
    for (let i = 0; i < rawList.length; i++) {
      const entry = rawList[i];
      const idx = i + 1;
      const ty = typeof entry;

      if (ty === 'string') {
        try {
          entries.push(JSON.parse(entry));
          console.log(`Entry ${idx}: type=${ty}, parsed=true`);
        } catch {
          console.warn(`Entry ${idx}: JSON.parse failed, skipping malformed string`);
          console.log(`Entry ${idx}: type=${ty}, parsed=false`);
        }
      } else if (ty === 'object' && entry !== null) {
        entries.push(entry);
        console.log(`Entry ${idx}: type=${ty}, parsed=true`);
      } else {
        console.warn(`Entry ${idx}: unexpected entry (${ty}); skipping`);
        console.log(`Entry ${idx}: type=${ty}, parsed=false`);
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
