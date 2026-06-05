import crypto from 'node:crypto';

const TIMEOUT_MS = 25_000;

const AERO_BASE = 'https://aeroapi.flightaware.com/aeroapi';

function formatAeroTime(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function authorizeRequest(req) {
  const expected = process.env.GA_DIAGNOSTIC_SECRET;
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

function parseIcao(raw) {
  if (raw == null || (typeof raw !== 'string' && typeof raw !== 'number')) {
    return { error: 'A valid four-character ICAO is required.' };
  }
  const icao = String(raw).trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    return { error: 'A valid four-character ICAO is required.' };
  }
  return { icao };
}

function parseMaxPages(raw) {
  if (raw == null || raw === '') return 10;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return 10;
  const n = parseInt(s, 10);
  if (n < 1 || n > 20) return { error: 'max_pages must be an integer between 1 and 20.' };
  return n;
}

function dedupeKey(f) {
  if (f?.fa_flight_id) return String(f.fa_flight_id);
  const ident = f?.ident || f?.ident_icao || '';
  const time = f?.actual_on || f?.estimated_on || f?.scheduled_on || f?.arrival_time || '';
  if (ident && time) return `${ident}|${time}`;
  if (ident) return String(ident);
  return null;
}

function dedupeArrivals(arrivals) {
  const seen = new Set();
  const out = [];
  for (const f of arrivals) {
    const key = dedupeKey(f);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(f);
  }
  return out;
}

function countByType(arrivals) {
  const counts = {};
  for (const f of arrivals) {
    const type = f?.type ?? 'unknown';
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

function allArrivalsHaveType(arrivals, expectedType) {
  if (!Array.isArray(arrivals) || arrivals.length === 0) return true;
  return arrivals.every((f) => f?.type === expectedType);
}

function buildSample(arrivals, limit = 5) {
  return arrivals.slice(0, limit).map((f) => ({
    ident: f?.ident ?? null,
    fa_flight_id: f?.fa_flight_id ?? null,
    aircraft_type: f?.aircraft_type ?? null,
    origin_icao: f?.origin?.code_icao ?? null,
    actual_on: f?.actual_on ?? null,
  }));
}

async function fetchGaArrivals(icao, apiKey, start, end, maxPages) {
  const params = new URLSearchParams({
    start,
    end,
    type: 'General_Aviation',
    max_pages: String(maxPages),
  });
  const url = `${AERO_BASE}/airports/${encodeURIComponent(icao)}/flights/arrivals?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'x-apikey': apiKey.trim() },
    });

    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      return { ok: false, status: res.status, error: 'Invalid JSON from FlightAware' };
    }

    if (!res.ok) {
      return { ok: false, status: res.status, error: `FlightAware request failed with HTTP ${res.status}` };
    }

    const arrivals = Array.isArray(body?.arrivals) ? body.arrivals : null;
    if (arrivals == null) {
      return { ok: false, status: res.status, error: 'FlightAware response missing arrivals array' };
    }

    const numPages =
      typeof body?.num_pages === 'number' && Number.isFinite(body.num_pages) && body.num_pages >= 1
        ? body.num_pages
        : null;
    const hasMore = Boolean(body?.links?.next);

    return { ok: true, arrivals, numPages, hasMore };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
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

  const icaoResult = parseIcao(req.query?.icao);
  if (icaoResult.error) {
    return res.status(400).json({ ok: false, error: icaoResult.error });
  }
  const { icao } = icaoResult;

  const maxPagesResult = parseMaxPages(req.query?.max_pages);
  if (typeof maxPagesResult === 'object' && maxPagesResult.error) {
    return res.status(400).json({ ok: false, error: maxPagesResult.error });
  }
  const maxPages = maxPagesResult;

  const apiKey = process.env.FLIGHTAWARE_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    return res.status(500).json({
      ok: false,
      error:
        'Missing FLIGHTAWARE_API_KEY: set the environment variable to your FlightAware AeroAPI key.',
    });
  }

  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const start = formatAeroTime(yesterday);
    const end = formatAeroTime(now);

    const faResult = await fetchGaArrivals(icao, apiKey, start, end, maxPages);
    if (!faResult.ok) {
      return res.status(502).json({
        ok: false,
        icao,
        window: { start, end },
        requested_max_pages: maxPages,
        error: faResult.error,
      });
    }

    const { arrivals, numPages, hasMore } = faResult;
    const uniqueArrivals = dedupeArrivals(arrivals);
    const typeCounts = countByType(arrivals);

    return res.status(200).json({
      ok: true,
      icao,
      window: { start, end },
      requested_max_pages: maxPages,
      num_pages: numPages,
      arrivals_returned: arrivals.length,
      unique_arrivals: uniqueArrivals.length,
      has_more: hasMore,
      truncated: hasMore,
      all_are_general_aviation: allArrivalsHaveType(arrivals, 'General_Aviation'),
      type_counts: typeCounts,
      sample: buildSample(uniqueArrivals),
    });
  } catch (err) {
    console.error('test-ga-search unexpected error:', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
