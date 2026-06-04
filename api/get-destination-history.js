import { kv } from '@vercel/kv';

const HISTORY_KEY = 'gotango:arrivals:history';
const HISTORY_VERSION = 'ga_filtered_v2';
const MAX_DAILY_POINTS = 30;

const STATUS_LABELS = {
  heating: 'Heating',
  warming: 'Warming',
  steady: 'Steady',
  softening: 'Softening',
  cooling: 'Cooling',
  sleeper: 'Sleeper signal',
  off_season: 'Off season',
  data_building: 'Baseline building',
};

function statusLabel(status) {
  if (!status) return 'Baseline building';
  return STATUS_LABELS[status] || String(status);
}

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

function safeNullableNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeTruncatedFlag(v) {
  return v === true;
}

function normalizePoint(row, fallbackDate) {
  const date = row.date || calendarDateUtc(row.saved_at) || fallbackDate;
  if (!date) return null;

  return {
    date,
    private_arrivals_24h: safeNum(row.private_arrivals_24h),
    weighted_private_signal_24h: safeNum(
      row.weighted_private_signal_24h ?? row.qualified_private_arrivals_24h,
    ),
    signal_score: safeNum(row.signal_score),
    status: row.status != null ? String(row.status) : 'data_building',
    status_label: statusLabel(row.status),
    arrival_count_truncated: safeTruncatedFlag(row.arrival_count_truncated),
    arrival_count_page_limit: safeNullableNum(row.arrival_count_page_limit),
    arrival_count_pages_returned: safeNullableNum(row.arrival_count_pages_returned),
    arrival_count_minimum: safeNullableNum(row.arrival_count_minimum),
    _saved_at: row.saved_at || null,
  };
}

function buildPointsForDestination(historyList, destId) {
  const byDate = new Map();

  for (const raw of historyList) {
    const rec = parseHistoryEntry(raw);
    if (!rec || !isV2HistoryRecord(rec)) continue;

    const recDate = calendarDateUtc(rec.saved_at);
    const perDest = Array.isArray(rec.per_destination) ? rec.per_destination : [];
    const row = perDest.find((p) => p && p.id === destId);
    if (!row) continue;

    const point = normalizePoint(row, recDate);
    if (!point) continue;

    const existing = byDate.get(point.date);
    if (!existing) {
      byDate.set(point.date, point);
      continue;
    }

    const existingTs = existing._saved_at ? Date.parse(existing._saved_at) : 0;
    const nextTs = point._saved_at ? Date.parse(point._saved_at) : 0;
    if (nextTs >= existingTs) {
      byDate.set(point.date, point);
    }
  }

  const points = [...byDate.values()]
    .map(({ _saved_at, ...rest }) => rest)
    .sort((a, b) => a.date.localeCompare(b.date));

  return points.length > MAX_DAILY_POINTS ? points.slice(-MAX_DAILY_POINTS) : points;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const destId = typeof req.query?.id === 'string' ? req.query.id.trim() : '';
  if (!destId || !/^[a-z0-9-]+$/.test(destId)) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid id query parameter' });
  }

  try {
    const rawHistory = await kv.lrange(HISTORY_KEY, 0, -1);
    const historyList = Array.isArray(rawHistory) ? rawHistory : [];
    const points = buildPointsForDestination(historyList, destId);

    return res.status(200).json({
      ok: true,
      id: destId,
      count: points.length,
      points,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[get-destination-history] KV read error: ${message}`);
    return res.status(200).json({
      ok: false,
      id: destId,
      error: message,
    });
  }
}
