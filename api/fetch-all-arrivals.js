import { kv } from '@vercel/kv';
import { DESTINATIONS } from '../destinations.config.js';

const TIMEOUT_MS = 25_000;

function formatAeroTime(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function classifyType(flight) {
  const t = flight?.type;
  if (t == null || t === '') return 'unknown';
  if (t === 'General_Aviation') return 'ga';
  return 'commercial';
}

function topOriginsFromArrivals(arrivals) {
  const m = new Map();
  for (const f of arrivals) {
    const o = f?.origin;
    const code = o?.code_icao || o?.code || 'UNKNOWN';
    const name = o?.name || o?.city || code;
    if (!m.has(code)) m.set(code, { code, name, count: 0 });
    m.get(code).count++;
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

function aircraftBreakdownFromArrivals(arrivals) {
  const m = new Map();
  for (const f of arrivals) {
    const t = f?.aircraft_type;
    const key = t && String(t).trim() ? String(t).trim() : 'UNKNOWN';
    if (!m.has(key)) {
      m.set(key, {
        type: key,
        count: 0,
        ga_count: 0,
      });
    }
    const entry = m.get(key);
    entry.count += 1;
    if (classifyType(f) === 'ga') entry.ga_count += 1;
  }
  return [...m.values()]
    .map(({ type, count, ga_count }) => ({
      type,
      count,
      is_ga: ga_count > 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function flightTimeMs(flight) {
  const candidates = [
    flight?.actual_on,
    flight?.arrival_time,
    flight?.scheduled_on,
    flight?.estimated_on,
    flight?.filed_ete,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function recentFlightsFromArrivals(arrivals) {
  return [...arrivals]
    .sort((a, b) => flightTimeMs(b) - flightTimeMs(a))
    .slice(0, 15)
    .map((f) => ({
      arrival_time: f?.actual_on || f?.arrival_time || f?.scheduled_on || f?.estimated_on || null,
      callsign: f?.ident || f?.callsign || null,
      aircraft_type: f?.aircraft_type || null,
      origin_icao: f?.origin?.code_icao || f?.origin?.code || null,
      origin_name: f?.origin?.name || f?.origin?.city || null,
      is_general_aviation: classifyType(f) === 'ga',
    }));
}

function countTypes(arrivals) {
  let general_aviation_count = 0;
  let commercial_count = 0;
  let unknown_type_count = 0;
  for (const f of arrivals) {
    const c = classifyType(f);
    if (c === 'ga') general_aviation_count++;
    else if (c === 'commercial') commercial_count++;
    else unknown_type_count++;
  }
  return { general_aviation_count, commercial_count, unknown_type_count };
}

async function fetchArrivalsForAirport(icao, apiKey, start, end) {
  const base = `https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(icao)}/flights/arrivals`;
  const params = new URLSearchParams({ start, end, max_pages: '1' });
  const url = `${base}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let arrivalsRes;
  try {
    arrivalsRes = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'x-apikey': apiKey.trim() },
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    const isAbort =
      fetchErr instanceof Error &&
      (fetchErr.name === 'AbortError' || fetchErr.message?.includes('aborted'));
    return {
      ok: false,
      arrivals: null,
      error: isAbort ? 'timeout' : fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
    };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!arrivalsRes.ok) {
    let detail = '';
    try {
      detail = (await arrivalsRes.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      arrivals: null,
      error: detail || `http_${arrivalsRes.status}`,
    };
  }

  let body;
  try {
    body = await arrivalsRes.json();
  } catch (parseErr) {
    return {
      ok: false,
      arrivals: null,
      error: 'json_parse',
    };
  }

  const arrivals = body?.arrivals;
  if (!Array.isArray(arrivals)) {
    return {
      ok: false,
      arrivals: null,
      error: 'invalid_arrivals_array',
    };
  }
  return { ok: true, arrivals, error: null };
}

async function processDestination(dest, apiKey, start, end, totalApiCalls) {
  const icaos = Array.isArray(dest.icao) ? dest.icao : [];
  const errors = [];
  let combined = [];
  let anyAirportOk = false;

  console.log(`[fetch-all-arrivals] Destination start: ${dest.id} (${dest.name})`);

  for (const icao of icaos) {
    try {
      totalApiCalls.count += 1;
      const r = await fetchArrivalsForAirport(icao, apiKey, start, end);
      if (r.ok) {
        anyAirportOk = true;
        combined = combined.concat(r.arrivals);
      } else {
        errors.push({ icao, error: r.error });
      }
    } catch (err) {
      console.error(`[fetch-all-arrivals] Airport fetch threw: ${dest.id} ${icao}`, err);
      errors.push({ icao, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const destOk = anyAirportOk;
  const arrivals_count = destOk ? combined.length : 0;
  const stats = countTypes(combined);
  const { general_aviation_count, commercial_count, unknown_type_count } = stats;
  const top_origins = topOriginsFromArrivals(combined);
  const aircraft_breakdown = aircraftBreakdownFromArrivals(combined);
  const recent_flights = recentFlightsFromArrivals(combined);
  const sample_flight = combined.length > 0 ? combined[0] : null;
  const fetched_at = new Date().toISOString();

  const result = {
    id: dest.id,
    name: dest.name,
    region: dest.region,
    lat: dest.lat,
    lng: dest.lng,
    icao: [...icaos],
    ok: destOk,
    arrivals_count,
    general_aviation_count: destOk ? general_aviation_count : 0,
    commercial_count: destOk ? commercial_count : 0,
    unknown_type_count: destOk ? unknown_type_count : 0,
    top_origins: destOk ? top_origins : [],
    aircraft_breakdown: destOk ? aircraft_breakdown : [],
    recent_flights: destOk ? recent_flights : [],
    sample_flight,
    errors,
    fetched_at,
  };

  const errTag = result.errors.length ? ` errors=${result.errors.map((e) => e.icao).join(',')}` : '';
  console.log(
    `[fetch-all-arrivals] Destination done: ${dest.id} ok=${destOk} arrivals_count=${arrivals_count}${errTag}`,
  );

  return result;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const t0 = Date.now();

  try {
    const apiKey = process.env.FLIGHTAWARE_API_KEY;
    if (!apiKey || !String(apiKey).trim()) {
      const errMsg =
        'Missing FLIGHTAWARE_API_KEY: set the environment variable to your FlightAware AeroAPI key.';
      const err = new Error(errMsg);
      console.error('fetch-all-arrivals config error:', err);
      return res.status(200).json({
        ok: false,
        stage: 'config',
        error: errMsg,
        duration_ms: Date.now() - t0,
      });
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const start = formatAeroTime(yesterday);
    const end = formatAeroTime(now);

    const totalApiCalls = { count: 0 };

    const total_destinations = DESTINATIONS.length;
    console.log(`[fetch-all-arrivals] Processing ${total_destinations} destinations in parallel (start=${start} end=${end})`);

    const destinationPromises = DESTINATIONS.map((dest) =>
      processDestination(dest, apiKey, start, end, totalApiCalls),
    );
    const destinations = await Promise.all(destinationPromises);

    const successful = destinations.filter((d) => d.ok).length;
    const failed = destinations.filter((d) => !d.ok).length;
    const total_arrivals_across_all = destinations.reduce((s, d) => s + d.arrivals_count, 0);
    const fetched_at = new Date().toISOString();
    const duration_ms = Date.now() - t0;

    console.log(
      `[fetch-all-arrivals] Summary: total_destinations=${total_destinations} successful=${successful} failed=${failed} total_arrivals_across_all=${total_arrivals_across_all} total_api_calls_made=${totalApiCalls.count} duration_ms=${duration_ms}`,
    );

    const responseBody = {
      ok: true,
      total_destinations,
      successful,
      failed,
      total_arrivals_across_all,
      total_api_calls_made: totalApiCalls.count,
      fetched_at,
      duration_ms,
      destinations,
      kv_saved: false,
      history_appended: false,
    };

    const okDestinationCount = destinations.filter((d) => d.ok).length;
    const sanityOkDestinations = okDestinationCount >= 15;
    const sanityTotalArrivals = total_arrivals_across_all > 0;

    if (!sanityOkDestinations || !sanityTotalArrivals) {
      const parts = [];
      if (!sanityOkDestinations) {
        parts.push(
          `only ${okDestinationCount} of 20 destinations have ok: true (need at least 15)`,
        );
      }
      if (!sanityTotalArrivals) {
        parts.push('total_arrivals_across_all is not greater than 0');
      }
      console.warn('Sanity check failed, skipping save:', parts.join('; '));
    } else {
      const savedAt = new Date().toISOString();
      console.log('Sanity check passed, saving to KV...');
      try {
        const latestPayload = { ...responseBody, kv_saved: true };
        await kv.set('gotango:arrivals:latest', latestPayload);
        await kv.set('gotango:arrivals:meta', {
          saved_at: savedAt,
          successful_count: successful,
          total_arrivals: total_arrivals_across_all,
          duration_ms,
        });
        responseBody.kv_saved = true;
        console.log('Saved to KV successfully');
      } catch (kvErr) {
        const msg = kvErr instanceof Error ? kvErr.message : String(kvErr);
        console.log(`Failed to save to KV: ${msg}`);
      }

      if (total_arrivals_across_all > 0 && successful >= 15) {
        try {
          const historyKey = 'gotango:arrivals:history';
          const per_destination = destinations.map((d) => ({
            id: d.id,
            arrivals_count: d.arrivals_count,
            general_aviation_count: d.general_aviation_count,
            commercial_count: d.commercial_count,
          }));
          const historyRecord = {
            saved_at: savedAt,
            total_arrivals: total_arrivals_across_all,
            successful_count: successful,
            duration_ms,
            per_destination,
          };
          const sizeBeforePush = await kv.llen(historyKey);
          console.log(
            `Appending to history (current size before trim: ${sizeBeforePush + 1})...`,
          );
          await kv.lpush(historyKey, historyRecord);
          await kv.ltrim(historyKey, 0, 29);
          responseBody.history_appended = true;
          console.log('History appended successfully');
        } catch (histErr) {
          const histMsg = histErr instanceof Error ? histErr.message : String(histErr);
          console.warn(`History append failed: ${histMsg}`);
        }
      }
    }

    return res.status(200).json(responseBody);
  } catch (err) {
    console.error('fetch-all-arrivals unexpected error:', err);
    return res.status(200).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      error_name: err instanceof Error ? err.name : null,
      duration_ms: Date.now() - t0,
    });
  }
}
