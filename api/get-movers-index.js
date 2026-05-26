import { kv } from '@vercel/kv';

const HISTORY_KEY = 'gotango:arrivals:history';
const HISTORY_VERSION = 'ga_filtered_v2';
const WINDOW_DAYS = 7;

function calendarDateUtc(iso) {
  if (!iso) return null;
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function parseHistoryEntry(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') {
    try {
      return JSON.parse(entry);
    } catch {
      return null;
    }
  }
  if (typeof entry === 'object') return entry;
  return null;
}

function isV2HistoryRecord(rec) {
  return rec?.history_version === HISTORY_VERSION;
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizePoint(row, fallbackDate) {
  const date = row.date || calendarDateUtc(row.saved_at) || fallbackDate;
  if (!date) return null;

  return {
    date,
    private_arrivals_24h: safeNum(row.private_arrivals_24h),
    signal_score: safeNum(row.signal_score),
    status: row.status != null ? String(row.status) : null,
    status_label: row.status_label != null ? String(row.status_label) : null,
    _saved_at: row.saved_at || null,
  };
}

function buildWeeklySummaries(historyList) {
  const byDestDate = new Map();

  for (const raw of historyList) {
    const rec = parseHistoryEntry(raw);
    if (!rec || !isV2HistoryRecord(rec)) continue;

    const recDate = calendarDateUtc(rec.saved_at);
    const perDest = Array.isArray(rec.per_destination) ? rec.per_destination : [];

    for (const row of perDest) {
      if (!row || !row.id) continue;

      const destId = String(row.id);
      const point = normalizePoint(row, recDate);
      if (!point) continue;

      const key = `${destId}|${point.date}`;
      const existing = byDestDate.get(key);
      if (!existing) {
        byDestDate.set(key, { ...point, id: destId });
        continue;
      }

      const existingTs = existing._saved_at ? Date.parse(existing._saved_at) : 0;
      const nextTs = point._saved_at ? Date.parse(point._saved_at) : 0;
      if (nextTs >= existingTs) {
        byDestDate.set(key, { ...point, id: destId });
      }
    }
  }

  const byDest = new Map();
  for (const point of byDestDate.values()) {
    const { id } = point;
    if (!byDest.has(id)) byDest.set(id, []);
    byDest.get(id).push(point);
  }

  const summaries = {};

  for (const [id, rawPoints] of byDest) {
    const sorted = rawPoints
      .map(({ _saved_at, ...rest }) => rest)
      .sort((a, b) => a.date.localeCompare(b.date));

    const windowPoints = sorted.length > WINDOW_DAYS ? sorted.slice(-WINDOW_DAYS) : sorted;
    const indexDaysCount = windowPoints.length;

    if (indexDaysCount === 0) continue;

    const scores = windowPoints.map((p) => p.signal_score);
    const latest = windowPoints[windowPoints.length - 1];
    const latestSignalScore = latest.signal_score;

    let index7dAvg = null;
    if (indexDaysCount >= 2) {
      const sum = scores.reduce((acc, n) => acc + n, 0);
      index7dAvg = Math.round(sum / indexDaysCount);
    } else {
      index7dAvg = latestSignalScore;
    }

    summaries[id] = {
      id,
      index_7d_avg: index7dAvg,
      index_7d_high: Math.max(...scores),
      index_7d_low: Math.min(...scores),
      latest_signal_score: latestSignalScore,
      index_days_count: indexDaysCount,
      latest_date: latest.date,
    };
  }

  return summaries;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const rawHistory = await kv.lrange(HISTORY_KEY, 0, -1);
    const historyList = Array.isArray(rawHistory) ? rawHistory : [];
    const summaries = buildWeeklySummaries(historyList);

    return res.status(200).json({
      ok: true,
      count: Object.keys(summaries).length,
      generated_at: new Date().toISOString(),
      summaries,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[get-movers-index] KV read error: ${message}`);
    return res.status(200).json({
      ok: false,
      error: message,
      count: 0,
      generated_at: new Date().toISOString(),
      summaries: {},
    });
  }
}
