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

function arrivalsFromBody(body) {
  if (body == null || typeof body !== 'object' || !Array.isArray(body.arrivals)) return null;
  return body.arrivals;
}

function hasLinksNext(body) {
  if (body == null || typeof body !== 'object') return false;
  const next = body.links?.next;
  return next != null && next !== '';
}

function allArrivalsHaveType(arrivals, expectedType) {
  if (!Array.isArray(arrivals)) return null;
  if (arrivals.length === 0) return true;
  for (const f of arrivals) {
    if (f?.type !== expectedType) return false;
  }
  return true;
}

async function aeroGetWithPhaseLogs(pathAndQuery, apiKey, logLabel, phaseTag) {
  console.log(`before ${phaseTag}: ${logLabel}`);
  const out = await aeroGet(pathAndQuery, apiKey, logLabel);
  console.log(`after ${phaseTag}: ${logLabel}`);
  return out;
}

async function aeroGetWithPhaseLogsSafe(pathAndQuery, apiKey, logLabel, phaseTag) {
  try {
    return await aeroGetWithPhaseLogs(pathAndQuery, apiKey, logLabel, phaseTag);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.log(`unexpected throw in ${phaseTag} ${logLabel}: ${message}`);
    return {
      status_code: null,
      duration_ms: null,
      error: message,
      stack,
      data: { _unexpected_throw: true, _message: message },
    };
  }
}

function buildSummary(call1, call2, call3, call4, call5, call6, call7) {
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

  const d5 = call5?.data;
  const d6 = call6?.data;
  const d7 = call7?.data;
  const arr5 = arrivalsFromBody(d5);
  const arr6 = arrivalsFromBody(d6);
  const arr7 = arrivalsFromBody(d7);

  const call_5_status_code = call5?.status_code ?? null;
  const call_6_status_code = call6?.status_code ?? null;
  const call_7_status_code = call7?.status_code ?? null;

  const call_5_arrivals_returned =
    call_5_status_code === 200 && arr5 != null ? arr5.length : null;
  const call_6_arrivals_returned =
    call_6_status_code === 200 && arr6 != null ? arr6.length : null;
  const call_7_arrivals_returned =
    call_7_status_code === 200 && arr7 != null ? arr7.length : null;

  const call_5_all_are_ga =
    call_5_status_code === 200 && arr5 != null ? allArrivalsHaveType(arr5, 'General_Aviation') : null;
  const call_6_all_are_airline =
    call_6_status_code === 200 && arr6 != null ? allArrivalsHaveType(arr6, 'Airline') : null;

  const call_5_has_links_next =
    call_5_status_code === 200 && d5 != null && typeof d5 === 'object' ? hasLinksNext(d5) : null;
  const call_6_has_links_next =
    call_6_status_code === 200 && d6 != null && typeof d6 === 'object' ? hasLinksNext(d6) : null;

  const call_5_num_pages = call_5_status_code === 200 ? numPagesFromBody(d5) : null;
  const call_6_num_pages = call_6_status_code === 200 ? numPagesFromBody(d6) : null;
  const call_7_num_pages = call_7_status_code === 200 ? numPagesFromBody(d7) : null;

  const call_7_estimated_24h_total = call_7_arrivals_returned;

  return {
    flights_returned_in_ga_search,
    has_arrived_flights,
    sample_actual_on_values: actualOnSamples,
    ga_count_from_count_endpoint,
    commercial_count_from_count_endpoint,
    arrivals_count_from_original_endpoint,
    call_5_status_code,
    call_5_arrivals_returned,
    call_5_all_are_ga,
    call_5_has_links_next,
    call_5_num_pages,
    call_6_status_code,
    call_6_arrivals_returned,
    call_6_all_are_airline,
    call_6_has_links_next,
    call_6_num_pages,
    call_7_status_code,
    call_7_arrivals_returned,
    call_7_num_pages,
    call_7_estimated_24h_total,
    num_pages_charged: {
      call_1_flights_search_ga: numPagesFromBody(d1),
      call_2_flights_search_count_airline: numPagesFromBody(call2?.data),
      call_3_flights_search_count_ga: numPagesFromBody(d3),
      call_4_airports_arrivals: numPagesFromBody(d4),
      call_5_arrivals_type_ga: numPagesFromBody(d5),
      call_6_arrivals_type_airline: numPagesFromBody(d6),
      call_7_arrivals_max_pages_5: numPagesFromBody(d7),
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
      const arrivalsTypeGaParams = new URLSearchParams({
        start,
        end,
        type: 'General_Aviation',
        max_pages: '1',
      });
      const arrivalsTypeAirlineParams = new URLSearchParams({
        start,
        end,
        type: 'Airline',
        max_pages: '1',
      });
      const arrivalsMaxPages5Params = new URLSearchParams({ start, end, max_pages: '5' });

      const path1 = `/flights/search?${searchGaParams.toString()}`;
      const path2 = `/flights/search/count?${countAirlineParams.toString()}`;
      const path3 = `/flights/search/count?${countGaParams.toString()}`;
      const path4 = `/airports/${encodeURIComponent(icao)}/flights/arrivals?${arrivalsParams.toString()}`;
      const path5 = `/airports/${encodeURIComponent(icao)}/flights/arrivals?${arrivalsTypeGaParams.toString()}`;
      const path6 = `/airports/${encodeURIComponent(icao)}/flights/arrivals?${arrivalsTypeAirlineParams.toString()}`;
      const path7 = `/airports/${encodeURIComponent(icao)}/flights/arrivals?${arrivalsMaxPages5Params.toString()}`;

      const [call1, call2, call3, call4, call5, call6, call7] = await Promise.all([
        aeroGet(path1, apiKey, `/flights/search for ${icao}`),
        aeroGet(path2, apiKey, `/flights/search/count airline for ${icao}`),
        aeroGet(path3, apiKey, `/flights/search/count ga for ${icao}`),
        aeroGet(path4, apiKey, `/airports/${icao}/flights/arrivals for ${icao}`),
        aeroGetWithPhaseLogsSafe(
          path5,
          apiKey,
          `/airports/${icao}/flights/arrivals type=General_Aviation for ${icao}`,
          'CALL 5',
        ),
        aeroGetWithPhaseLogsSafe(
          path6,
          apiKey,
          `/airports/${icao}/flights/arrivals type=Airline for ${icao}`,
          'CALL 6',
        ),
        aeroGetWithPhaseLogsSafe(
          path7,
          apiKey,
          `/airports/${icao}/flights/arrivals max_pages=5 for ${icao}`,
          'CALL 7',
        ),
      ]);

      const summary = buildSummary(call1, call2, call3, call4, call5, call6, call7);

      results.push({
        icao,
        label,
        call_1_flights_search_ga: call1,
        call_2_flights_search_count_airline: call2,
        call_3_flights_search_count_ga: call3,
        call_4_airports_arrivals: call4,
        call_5_arrivals_type_ga: call5,
        call_6_arrivals_type_airline: call6,
        call_7_arrivals_max_pages_5: call7,
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
