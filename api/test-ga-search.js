const TIMEOUT_MS = 25_000;

const AERO_BASE = 'https://aeroapi.flightaware.com/aeroapi';

function formatAeroTime(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * One AeroAPI GET; isolated try/catch — failures return structured error, never throw.
 */
async function aeroGet(pathAndQuery, apiKey, logLabel) {
  const url = pathAndQuery.startsWith('http') ? pathAndQuery : `${AERO_BASE}${pathAndQuery}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    console.log(`calling ${logLabel}`);
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'x-apikey': apiKey.trim() },
    });
    const duration_ms = Date.now() - t0;
    console.log(`got response status ${res.status} for ${logLabel}`);
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { _parse_error: true, _raw_text: text };
    }
    return {
      status_code: res.status,
      duration_ms,
      data,
    };
  } catch (err) {
    const duration_ms = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.log(`error for ${logLabel}: ${message}`);
    return {
      status_code: null,
      duration_ms,
      error: message,
      stack,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function numPagesFromBody(body) {
  if (body == null || typeof body !== 'object') return null;
  if ('num_pages' in body && body.num_pages != null) return body.num_pages;
  return null;
}

function buildSummary(call1, call2, call3, call4) {
  const d1 = call1?.data;
  const flights = Array.isArray(d1?.flights) ? d1.flights : [];
  const flights_returned_in_ga_search = flights.length;

  const actualOnSamples = [];
  let has_arrived_flights = false;
  for (const f of flights) {
    if (f && f.actual_on != null && f.actual_on !== '') {
      has_arrived_flights = true;
      if (actualOnSamples.length < 3) actualOnSamples.push(f.actual_on);
    }
  }

  let ga_count_from_count_endpoint = null;
  const d3 = call3?.data;
  if (d3 != null && typeof d3 === 'object') {
    if (typeof d3.count === 'number') ga_count_from_count_endpoint = d3.count;
    else if (typeof d3.count === 'string' && d3.count !== '') {
      const n = Number(d3.count);
      if (!Number.isNaN(n)) ga_count_from_count_endpoint = n;
    }
  }

  let commercial_count_from_count_endpoint = null;
  const d2 = call2?.data;
  if (d2 != null && typeof d2 === 'object') {
    if (typeof d2.count === 'number') commercial_count_from_count_endpoint = d2.count;
    else if (typeof d2.count === 'string' && d2.count !== '') {
      const n = Number(d2.count);
      if (!Number.isNaN(n)) commercial_count_from_count_endpoint = n;
    }
  }

  let arrivals_count_from_original_endpoint = null;
  const d4 = call4?.data;
  if (d4 != null && typeof d4 === 'object' && Array.isArray(d4.arrivals)) {
    arrivals_count_from_original_endpoint = d4.arrivals.length;
  }

  return {
    flights_returned_in_ga_search,
    has_arrived_flights,
    sample_actual_on_values: actualOnSamples,
    ga_count_from_count_endpoint,
    commercial_count_from_count_endpoint,
    arrivals_count_from_original_endpoint,
    num_pages_charged: {
      call_1_flights_search_ga: numPagesFromBody(d1),
      call_2_flights_search_count_airline: numPagesFromBody(call2?.data),
      call_3_flights_search_count_ga: numPagesFromBody(d3),
      call_4_airports_arrivals: numPagesFromBody(d4),
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  console.log('test-ga-search invoked');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const secret = req.query?.secret ?? req.query?.Secret;
  if (secret !== 'test-ga-2026') {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  try {
    const apiKey = process.env.FLIGHTAWARE_API_KEY;
    if (!apiKey || !String(apiKey).trim()) {
      return res.status(500).json({
        ok: false,
        error:
          'Missing FLIGHTAWARE_API_KEY: set the environment variable to your FlightAware AeroAPI key.',
      });
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const start = formatAeroTime(yesterday);
    const end = formatAeroTime(now);

    const test_destinations = [
      { icao: 'VTSP', label: 'Phuket (large, commercial-heavy)' },
      { icao: 'TFFJ', label: 'St. Barthélemy (small, private-heavy)' },
      { icao: 'OMDW', label: 'Dubai Al Maktoum (large, mixed)' },
    ];

    const results = [];

    for (const { icao, label } of test_destinations) {
      const qGa = `-destination ${icao} -filter ga`;
      const qAirline = `-destination ${icao} -filter airline`;

      const searchGaParams = new URLSearchParams({
        query: qGa,
        max_pages: '2',
      });
      const countAirlineParams = new URLSearchParams({ query: qAirline });
      const countGaParams = new URLSearchParams({ query: qGa });
      const arrivalsParams = new URLSearchParams({ start, end, max_pages: '1' });

      const path1 = `/flights/search?${searchGaParams.toString()}`;
      const path2 = `/flights/search/count?${countAirlineParams.toString()}`;
      const path3 = `/flights/search/count?${countGaParams.toString()}`;
      const path4 = `/airports/${encodeURIComponent(icao)}/flights/arrivals?${arrivalsParams.toString()}`;

      const [call1, call2, call3, call4] = await Promise.all([
        aeroGet(path1, apiKey, `/flights/search for ${icao}`),
        aeroGet(path2, apiKey, `/flights/search/count airline for ${icao}`),
        aeroGet(path3, apiKey, `/flights/search/count ga for ${icao}`),
        aeroGet(path4, apiKey, `/airports/${icao}/flights/arrivals for ${icao}`),
      ]);

      const summary = buildSummary(call1, call2, call3, call4);

      results.push({
        icao,
        label,
        call_1_flights_search_ga: call1,
        call_2_flights_search_count_airline: call2,
        call_3_flights_search_count_ga: call3,
        call_4_airports_arrivals: call4,
        summary,
      });
    }

    const duration_ms = Date.now() - t0;

    return res.status(200).json({
      ok: true,
      started_at: startedAt,
      duration_ms,
      note: 'Diagnostic endpoint for new GA-only architecture. Tests three destinations across the size spectrum.',
      test_destinations,
      results,
    });
  } catch (err) {
    console.error('test-ga-search unexpected error:', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
}
