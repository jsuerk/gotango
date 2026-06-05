import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import { SHADOW_DESTINATIONS } from '../shadow-destinations.config.js';

const TIMEOUT_MS = 25_000;
const DESTINATION_START_DEADLINE_MS = 28_000;
const HARD_EXECUTION_DEADLINE_MS = 52_000;
const WORKER_CONCURRENCY = 4;
const HISTORY_VERSION = 'shadow_ga_v1';

const PREMIUM_PRIVATE_PREFIXES = [
  'GLF', 'GLEX', 'G650', 'G550', 'G600', 'G700', 'C25', 'C56', 'C68', 'C75',
  'CL30', 'CL35', 'CL60', 'FA7X', 'F2TH', 'LJ', 'E50P', 'E55P', 'E75L', 'H25B', 'BE40',
];
const TURBOPROP_PREFIXES = ['PC12', 'TBM', 'BE9L', 'B350', 'B300', 'C208'];
const LIGHT_GA_PREFIXES = ['C172', 'C182', 'PA28', 'SR20', 'SR22'];

function parsePositiveInt(raw, fallback) {
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function parseMaxPages() {
  const n = parsePositiveInt(process.env.SHADOW_GA_MAX_PAGES, 3);
  if (n == null || n < 1 || n > 10) return { error: 'SHADOW_GA_MAX_PAGES must be an integer from 1 to 10.' };
  return { value: n };
}

function parsePageBudget() {
  const n = parsePositiveInt(process.env.SHADOW_DAILY_PAGE_BUDGET, 60);
  if (n == null || n < 1 || n > 200) {
    return { error: 'SHADOW_DAILY_PAGE_BUDGET must be an integer from 1 to 200.' };
  }
  return { value: n };
}

function parseActiveBatch() {
  const n = parsePositiveInt(process.env.SHADOW_ACTIVE_BATCH, 1);
  if (n == null) return { error: 'SHADOW_ACTIVE_BATCH must be a positive integer.' };
  return { value: n };
}

function formatAeroTime(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function calendarDateUtc(iso) {
  if (!iso) return null;
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function matchesAircraftPrefix(typeUpper, prefixes) {
  return prefixes.some((p) => typeUpper.startsWith(p) || typeUpper.includes(p));
}

function classifyAircraftBucket(aircraftType) {
  if (!aircraftType || !String(aircraftType).trim()) return 'unknown';
  const t = String(aircraftType).trim().toUpperCase();
  if (matchesAircraftPrefix(t, PREMIUM_PRIVATE_PREFIXES)) return 'premium_private';
  if (matchesAircraftPrefix(t, TURBOPROP_PREFIXES)) return 'turboprop';
  if (matchesAircraftPrefix(t, LIGHT_GA_PREFIXES)) return 'light_ga';
  return 'unknown';
}

function dedupeKey(f) {
  if (f?.fa_flight_id) return String(f.fa_flight_id);
  const ident = f?.ident || f?.ident_icao || '';
  const time = f?.actual_on || f?.estimated_on || f?.scheduled_on || f?.arrival_time || '';
  if (ident && time) return `${ident}|${time}`;
  if (ident) return String(ident);
  return null;
}

function dedupeFlights(flights) {
  const seen = new Set();
  const out = [];
  for (const f of flights) {
    const key = dedupeKey(f);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(f);
  }
  return out;
}

function topOriginsFromArrivals(arrivals, limit = 5) {
  const m = new Map();
  for (const f of arrivals) {
    const o = f?.origin;
    const code = o?.code_icao || o?.code || 'UNKNOWN';
    const name = o?.name || o?.city || code;
    if (!m.has(code)) m.set(code, { code, name, count: 0 });
    m.get(code).count += 1;
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

function aircraftMixFromArrivals(arrivals, limit = 8) {
  const m = new Map();
  for (const f of arrivals) {
    const t = f?.aircraft_type;
    const key = t && String(t).trim() ? String(t).trim() : 'UNKNOWN';
    if (!m.has(key)) {
      m.set(key, { type: key, count: 0, bucket: classifyAircraftBucket(key) });
    }
    m.get(key).count += 1;
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

function flightTimeMs(flight) {
  const candidates = [
    flight?.actual_on,
    flight?.estimated_on,
    flight?.scheduled_on,
    flight?.arrival_time,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function recentArrivalsFromFlights(arrivals, limit = 5) {
  return [...arrivals]
    .sort((a, b) => flightTimeMs(b) - flightTimeMs(a))
    .slice(0, limit)
    .map((f) => ({
      arrival_time: f?.actual_on || f?.estimated_on || f?.scheduled_on || f?.arrival_time || null,
      callsign: f?.ident || f?.ident_icao || null,
      aircraft_type: f?.aircraft_type || null,
      origin_icao: f?.origin?.code_icao || null,
      origin_name: f?.origin?.name || f?.origin?.city || null,
    }));
}

function repeatedTailRouteStats(arrivals) {
  const routeCounts = new Map();
  for (const f of arrivals) {
    const tail = f?.registration || f?.ident || f?.ident_icao || '';
    const origin = f?.origin?.code_icao || f?.origin?.code || '';
    const dest = f?.destination?.code_icao || f?.destination?.code || '';
    if (!tail) continue;
    const key = `${tail}|${origin}|${dest}`;
    routeCounts.set(key, (routeCounts.get(key) || 0) + 1);
  }
  let repeated = 0;
  for (const count of routeCounts.values()) {
    if (count > 1) repeated += count;
  }
  const total = arrivals.length;
  return {
    repeated_tail_route_count: repeated,
    repeated_tail_route_share: total > 0 ? Math.round((repeated / total) * 1000) / 1000 : 0,
  };
}

function countUnknownAircraftTypes(arrivals) {
  let n = 0;
  for (const f of arrivals) {
    if (classifyAircraftBucket(f?.aircraft_type) === 'unknown') n += 1;
  }
  return n;
}

function countDistinctOrigins(arrivals) {
  const s = new Set();
  for (const f of arrivals) {
    const code = f?.origin?.code_icao || f?.origin?.code;
    if (code) s.add(code);
  }
  return s.size;
}

function countUnknownOrigins(arrivals) {
  let n = 0;
  for (const f of arrivals) {
    const code = f?.origin?.code_icao || f?.origin?.code;
    if (!code) n += 1;
  }
  return n;
}

/** Distinct aircraft type strings (not tail/registration identifiers). */
function countDistinctAircraftTypes(arrivals) {
  const s = new Set();
  for (const f of arrivals) {
    const t = f?.aircraft_type;
    if (t && String(t).trim()) s.add(String(t).trim());
  }
  return s.size;
}

function aircraftIdentityFromArrivals(arrivals) {
  const identifiers = new Set();
  let knownCount = 0;
  for (const f of arrivals) {
    const reg = f?.registration && String(f.registration).trim();
    if (reg) {
      identifiers.add(reg);
      knownCount += 1;
    }
  }
  const total = arrivals.length;
  return {
    distinct_aircraft_identifiers: identifiers.size,
    aircraft_identity_known_count: knownCount,
    aircraft_identity_coverage:
      total > 0 ? Math.round((knownCount / total) * 1000) / 1000 : 0,
  };
}

function screeningResult(diag) {
  if (!diag.ok) return 'fetch_failed';
  if (diag.truncated) return 'needs_targeted_volume_test';
  if (diag.unique_ga_arrivals === 0) return 'insufficient_activity';
  return 'collected';
}

function hasQuerySecret(req) {
  const q = req.query || {};
  const keys = ['secret', 'token', 'authorization', 'auth', 'api_key', 'apikey'];
  return keys.some((k) => q[k] != null && String(q[k]).trim() !== '');
}

function timingSafeMatch(provided, expected) {
  const expectedBuf = Buffer.from(String(expected).trim());
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

function authorizeRequest(req) {
  if (hasQuerySecret(req)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  const secrets = [process.env.SHADOW_FETCH_SECRET, process.env.CRON_SECRET]
    .filter((s) => s != null && String(s).trim() !== '');

  if (secrets.length === 0) {
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
  const authorized = secrets.some((secret) => timingSafeMatch(provided, secret));
  if (!authorized) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true };
}

function pagesFromSuccessfulResponse(numPages) {
  if (
    typeof numPages === 'number' &&
    Number.isInteger(numPages) &&
    Number.isFinite(numPages) &&
    numPages >= 1
  ) {
    return numPages;
  }
  return 1;
}

async function fetchGaArrivalsForAirport(icao, apiKey, start, end, maxPages, hardAbortSignal) {
  const base = `https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(icao)}/flights/arrivals`;
  const params = new URLSearchParams({
    start,
    end,
    max_pages: String(maxPages),
    type: 'General_Aviation',
  });
  const url = `${base}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onHardAbort = () => controller.abort();
  if (hardAbortSignal?.aborted) {
    controller.abort();
  } else if (hardAbortSignal) {
    hardAbortSignal.addEventListener('abort', onHardAbort, { once: true });
  }

  let arrivalsRes;
  try {
    arrivalsRes = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'x-apikey': apiKey.trim() },
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    if (hardAbortSignal) hardAbortSignal.removeEventListener('abort', onHardAbort);
    const isAbort =
      fetchErr instanceof Error &&
      (fetchErr.name === 'AbortError' || fetchErr.message?.includes('aborted'));
    const hardDeadline = hardAbortSignal?.aborted === true;
    return {
      ok: false,
      arrivals: null,
      hasMore: false,
      numPages: null,
      rawRecordCount: 0,
      filteredRecordCount: 0,
      error: isAbort ? (hardDeadline ? 'execution_deadline' : 'timeout') : fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
    };
  } finally {
    clearTimeout(timeoutId);
    if (hardAbortSignal) hardAbortSignal.removeEventListener('abort', onHardAbort);
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
      hasMore: false,
      numPages: null,
      rawRecordCount: 0,
      filteredRecordCount: 0,
      error: detail || `http_${arrivalsRes.status}`,
    };
  }

  let body;
  try {
    body = await arrivalsRes.json();
  } catch {
    return {
      ok: false,
      arrivals: null,
      hasMore: false,
      numPages: null,
      rawRecordCount: 0,
      filteredRecordCount: 0,
      error: 'json_parse',
    };
  }

  const rawArrivals = body?.arrivals;
  if (!Array.isArray(rawArrivals)) {
    return {
      ok: false,
      arrivals: null,
      hasMore: false,
      numPages: null,
      rawRecordCount: 0,
      filteredRecordCount: 0,
      error: 'invalid_arrivals_array',
    };
  }

  const filtered = rawArrivals.filter((f) => f?.type === 'General_Aviation');
  const reportedNumPages =
    typeof body?.num_pages === 'number' &&
    Number.isInteger(body.num_pages) &&
    Number.isFinite(body.num_pages) &&
    body.num_pages >= 1
      ? body.num_pages
      : null;
  const numPages = pagesFromSuccessfulResponse(reportedNumPages);
  const hasMore = Boolean(body?.links?.next);

  return {
    ok: true,
    arrivals: filtered,
    hasMore,
    numPages,
    reportedNumPages,
    rawRecordCount: rawArrivals.length,
    filteredRecordCount: filtered.length,
    error: null,
  };
}

function emptyOriginDiagnostics() {
  return {
    distinct_origins: 0,
    top_origin_count: 0,
    top_origin_share: 0,
    unknown_origin_count: 0,
    unknown_origin_share: 0,
    top_origins: [],
  };
}

function emptyAircraftDiagnostics() {
  return {
    distinct_aircraft: 0,
    distinct_aircraft_identifiers: 0,
    aircraft_identity_known_count: 0,
    aircraft_identity_coverage: 0,
    unknown_aircraft_type_count: 0,
    aircraft_mix: [],
  };
}

function buildSkippedDiagnostic(dest, windowStart, windowEnd, pageLimit, reason) {
  const fetchedAt = new Date().toISOString();
  const diag = {
    id: dest.id,
    name: dest.name,
    region: dest.region,
    icao: Array.isArray(dest.icao) ? [...dest.icao] : [],
    ok: false,
    fetched_at: fetchedAt,
    window_start: windowStart,
    window_end: windowEnd,
    page_limit: pageLimit,
    pages_returned: 0,
    raw_records_returned: 0,
    filtered_ga_records: 0,
    unique_ga_arrivals: 0,
    has_more: false,
    truncated: false,
    ...emptyAircraftDiagnostics(),
    ...emptyOriginDiagnostics(),
    repeated_tail_route_count: 0,
    repeated_tail_route_share: 0,
    recent_arrivals: [],
    errors: [],
    skipped_reason: reason,
    screening_result: 'fetch_failed',
    history_action: null,
  };
  return diag;
}

function buildFailedDiagnostic(dest, windowStart, windowEnd, pageLimit, errors) {
  const fetchedAt = new Date().toISOString();
  const diag = {
    id: dest.id,
    name: dest.name,
    region: dest.region,
    icao: Array.isArray(dest.icao) ? [...dest.icao] : [],
    ok: false,
    fetched_at: fetchedAt,
    window_start: windowStart,
    window_end: windowEnd,
    page_limit: pageLimit,
    pages_returned: 0,
    raw_records_returned: 0,
    filtered_ga_records: 0,
    unique_ga_arrivals: 0,
    has_more: false,
    truncated: false,
    ...emptyAircraftDiagnostics(),
    ...emptyOriginDiagnostics(),
    repeated_tail_route_count: 0,
    repeated_tail_route_share: 0,
    recent_arrivals: [],
    errors,
    screening_result: 'fetch_failed',
    history_action: null,
  };
  return diag;
}

function originDiagnosticsFromArrivals(uniqueArrivals) {
  const topOrigins = topOriginsFromArrivals(uniqueArrivals, 5);
  const topOriginCount = topOrigins[0]?.count || 0;
  const unknownOriginCount = countUnknownOrigins(uniqueArrivals);
  const denominator = uniqueArrivals.length;
  return {
    distinct_origins: countDistinctOrigins(uniqueArrivals),
    top_origin_count: topOriginCount,
    top_origin_share:
      denominator > 0 ? Math.round((topOriginCount / denominator) * 1000) / 1000 : 0,
    unknown_origin_count: unknownOriginCount,
    unknown_origin_share:
      denominator > 0 ? Math.round((unknownOriginCount / denominator) * 1000) / 1000 : 0,
    top_origins: topOrigins,
  };
}

async function processShadowDestination(dest, apiKey, start, end, pageLimit, hardAbortSignal) {
  const icaos = Array.isArray(dest.icao) ? dest.icao : [];
  const errors = [];
  let gaCombined = [];
  let anyGaOk = false;
  let pagesReturned = 0;
  let rawRecordsReturned = 0;
  let filteredGaRecords = 0;
  let hasMore = false;
  let truncated = false;

  for (const icao of icaos) {
    if (hardAbortSignal?.aborted) {
      errors.push({ icao, type: 'General_Aviation', error: 'execution_deadline' });
      continue;
    }
    try {
      const gaRes = await fetchGaArrivalsForAirport(
        icao,
        apiKey,
        start,
        end,
        pageLimit,
        hardAbortSignal,
      );
      if (gaRes.ok) {
        anyGaOk = true;
        gaCombined = gaCombined.concat(gaRes.arrivals);
        rawRecordsReturned += gaRes.rawRecordCount;
        filteredGaRecords += gaRes.filteredRecordCount;
        pagesReturned += gaRes.numPages;
        if (gaRes.hasMore) {
          hasMore = true;
          truncated = true;
        }
      } else {
        errors.push({ icao, type: 'General_Aviation', error: gaRes.error });
      }
    } catch (err) {
      errors.push({
        icao,
        type: 'General_Aviation',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!anyGaOk) {
    return buildFailedDiagnostic(dest, start, end, pageLimit, errors);
  }

  const uniqueArrivals = dedupeFlights(gaCombined);
  const tailStats = repeatedTailRouteStats(uniqueArrivals);
  const aircraftIdentity = aircraftIdentityFromArrivals(uniqueArrivals);
  const fetchedAt = new Date().toISOString();

  const diag = {
    id: dest.id,
    name: dest.name,
    region: dest.region,
    icao: [...icaos],
    ok: true,
    fetched_at: fetchedAt,
    window_start: start,
    window_end: end,
    page_limit: pageLimit,
    pages_returned: pagesReturned,
    raw_records_returned: rawRecordsReturned,
    filtered_ga_records: filteredGaRecords,
    unique_ga_arrivals: uniqueArrivals.length,
    has_more: hasMore,
    truncated,
    distinct_aircraft: countDistinctAircraftTypes(uniqueArrivals),
    ...aircraftIdentity,
    ...originDiagnosticsFromArrivals(uniqueArrivals),
    unknown_aircraft_type_count: countUnknownAircraftTypes(uniqueArrivals),
    repeated_tail_route_count: tailStats.repeated_tail_route_count,
    repeated_tail_route_share: tailStats.repeated_tail_route_share,
    aircraft_mix: aircraftMixFromArrivals(uniqueArrivals, 8),
    recent_arrivals: recentArrivalsFromFlights(uniqueArrivals, 5),
    errors,
    screening_result: null,
    history_action: null,
  };
  diag.screening_result = screeningResult(diag);
  return diag;
}

async function runWorkerPool(destinations, apiKey, start, end, pageLimit, t0, hardAbortSignal) {
  const results = new Array(destinations.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      if (Date.now() - t0 >= DESTINATION_START_DEADLINE_MS) {
        const i = nextIndex++;
        if (i >= destinations.length) return;
        results[i] = buildSkippedDiagnostic(
          destinations[i],
          start,
          end,
          pageLimit,
          'execution_deadline',
        );
        continue;
      }

      const i = nextIndex++;
      if (i >= destinations.length) return;

      try {
        results[i] = await processShadowDestination(
          destinations[i],
          apiKey,
          start,
          end,
          pageLimit,
          hardAbortSignal,
        );
      } catch (err) {
        results[i] = buildFailedDiagnostic(destinations[i], start, end, pageLimit, [
          {
            icao: destinations[i]?.icao?.[0] || null,
            type: 'General_Aviation',
            error: err instanceof Error ? err.message : String(err),
          },
        ]);
      }
    }
  }

  const workerCount = Math.min(WORKER_CONCURRENCY, destinations.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function compactHistoryPoint(diag) {
  return {
    history_version: HISTORY_VERSION,
    saved_at: diag.fetched_at,
    snapshot_date: calendarDateUtc(diag.fetched_at),
    id: diag.id,
    name: diag.name,
    unique_ga_arrivals: diag.unique_ga_arrivals,
    filtered_ga_records: diag.filtered_ga_records,
    truncated: diag.truncated,
    screening_result: diag.screening_result,
    distinct_origins: diag.distinct_origins,
    distinct_aircraft: diag.distinct_aircraft,
    top_origin_share: diag.top_origin_share,
    pages_returned: diag.pages_returned,
  };
}

function compactRunSummary(summary) {
  return {
    saved_at: summary.saved_at,
    active_batch: summary.active_batch,
    destination_count_attempted: summary.destination_count_attempted,
    destination_count_completed: summary.destination_count_completed,
    destination_count_failed: summary.destination_count_failed,
    destination_count_skipped: summary.destination_count_skipped,
    actual_pages_consumed: summary.actual_pages_consumed,
    page_budget_remaining: summary.page_budget_remaining,
    truncated_destination_count: summary.truncated_destination_count,
    duration_ms: summary.duration_ms,
  };
}

async function saveShadowResults(summary, diagnostics) {
  const savedAt = summary.saved_at;
  const meta = {
    saved_at: savedAt,
    active_batch: summary.active_batch,
    pages_consumed: summary.actual_pages_consumed,
    page_budget: summary.page_budget,
    successful_count: summary.destination_count_completed,
    failed_count: summary.destination_count_failed,
    skipped_count: summary.destination_count_skipped,
    duration_ms: summary.duration_ms,
  };

  const batchStatus = {
    active_batch: summary.active_batch,
    candidate_count: summary.destination_count_attempted,
    last_started_at: summary.started_at,
    last_completed_at: savedAt,
    last_result:
      summary.destination_count_skipped > 0
        ? 'partial'
        : summary.destination_count_failed > 0
          ? 'partial'
          : 'success',
  };

  const runEntry = compactRunSummary(summary);

  await kv.set('gotango:shadow:latest', summary);
  await kv.set('gotango:shadow:meta', meta);
  await kv.lpush('gotango:shadow:runs', runEntry);
  await kv.ltrim('gotango:shadow:runs', 0, 29);
  await kv.set('gotango:shadow:batch-status', batchStatus);

  for (const diag of diagnostics) {
    const point = compactHistoryPoint(diag);
    const newest = await kv.lindex(`gotango:shadow:history:${diag.id}`, 0);
    const newestSnapshotDate =
      newest && typeof newest === 'object' && newest.snapshot_date
        ? String(newest.snapshot_date)
        : newest && typeof newest === 'object' && newest.date
          ? String(newest.date)
          : null;

    if (newestSnapshotDate && newestSnapshotDate === point.snapshot_date) {
      diag.history_action = 'same_day_skipped';
    } else {
      await kv.lpush(`gotango:shadow:history:${diag.id}`, point);
      await kv.ltrim(`gotango:shadow:history:${diag.id}`, 0, 6);
      diag.history_action = 'appended';
    }

    await kv.set(`gotango:shadow:diagnostics:${diag.id}`, diag);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const t0 = Date.now();
  const startedAt = new Date().toISOString();

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (process.env.SHADOW_FETCH_ENABLED !== 'true') {
    return res.status(403).json({ ok: false, error: 'Shadow fetch is disabled' });
  }

  const auth = authorizeRequest(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const batchResult = parseActiveBatch();
  if (batchResult.error) {
    return res.status(400).json({ ok: false, stage: 'config', error: batchResult.error });
  }
  const activeBatch = batchResult.value;

  const maxPagesResult = parseMaxPages();
  if (maxPagesResult.error) {
    return res.status(400).json({ ok: false, stage: 'config', error: maxPagesResult.error });
  }
  const maxPages = maxPagesResult.value;

  const budgetResult = parsePageBudget();
  if (budgetResult.error) {
    return res.status(400).json({ ok: false, stage: 'config', error: budgetResult.error });
  }
  const pageBudget = budgetResult.value;

  const selected = SHADOW_DESTINATIONS.filter((d) => d.batch === activeBatch);
  if (selected.length === 0) {
    return res.status(400).json({
      ok: false,
      stage: 'config',
      error: `SHADOW_ACTIVE_BATCH=${activeBatch} has no configured destinations.`,
      active_batch: activeBatch,
    });
  }

  const theoreticalMaxPages = selected.length * maxPages;

  if (theoreticalMaxPages > pageBudget) {
    return res.status(400).json({
      ok: false,
      stage: 'config',
      error: 'Selected batch theoretical page ceiling exceeds daily page budget.',
      theoretical_max_pages: theoreticalMaxPages,
      page_budget: pageBudget,
      destination_count: selected.length,
      max_pages: maxPages,
      active_batch: activeBatch,
    });
  }

  const apiKey = process.env.FLIGHTAWARE_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    return res.status(500).json({
      ok: false,
      stage: 'config',
      error:
        'Missing FLIGHTAWARE_API_KEY: set the environment variable to your FlightAware AeroAPI key.',
    });
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const start = formatAeroTime(yesterday);
  const end = formatAeroTime(now);

  const hardAbortController = new AbortController();
  const hardDeadlineRemaining = Math.max(0, HARD_EXECUTION_DEADLINE_MS - (Date.now() - t0));
  const hardDeadlineTimer = setTimeout(() => {
    hardAbortController.abort();
  }, hardDeadlineRemaining);

  let diagnostics;
  try {
    diagnostics = await runWorkerPool(
      selected,
      apiKey,
      start,
      end,
      maxPages,
      t0,
      hardAbortController.signal,
    );
  } finally {
    clearTimeout(hardDeadlineTimer);
  }

  const destinationCountSkipped = diagnostics.filter((d) => d.skipped_reason).length;
  const destinationCountCompleted = diagnostics.filter((d) => d.ok).length;
  const destinationCountFailed = diagnostics.filter((d) => !d.ok && !d.skipped_reason).length;
  const truncatedDestinationCount = diagnostics.filter((d) => d.truncated).length;

  const actualPagesConsumed = diagnostics.reduce((sum, d) => {
    if (d.ok && typeof d.pages_returned === 'number' && d.pages_returned > 0) {
      return sum + d.pages_returned;
    }
    return sum;
  }, 0);

  if (actualPagesConsumed < 0 || actualPagesConsumed > theoreticalMaxPages) {
    console.error(
      `[fetch-shadow-arrivals] Page accounting out of range: actual=${actualPagesConsumed} theoretical_max=${theoreticalMaxPages}`,
    );
  }

  const savedAt = new Date().toISOString();
  const durationMs = Date.now() - t0;

  const summary = {
    ok: true,
    history_version: HISTORY_VERSION,
    saved_at: savedAt,
    started_at: startedAt,
    active_batch: activeBatch,
    window_start: start,
    window_end: end,
    max_pages: maxPages,
    theoretical_max_pages: theoreticalMaxPages,
    actual_pages_consumed: actualPagesConsumed,
    page_budget: pageBudget,
    page_budget_remaining: pageBudget - actualPagesConsumed,
    destination_count_attempted: selected.length,
    destination_count_completed: destinationCountCompleted,
    destination_count_failed: destinationCountFailed,
    destination_count_skipped: destinationCountSkipped,
    truncated_destination_count: truncatedDestinationCount,
    duration_ms: durationMs,
    destinations: diagnostics,
  };

  try {
    await saveShadowResults(summary, diagnostics);
    summary.kv_saved = true;
  } catch (kvErr) {
    console.error('[fetch-shadow-arrivals] KV save failed:', kvErr);
    summary.kv_saved = false;
    summary.kv_error = kvErr instanceof Error ? kvErr.message : String(kvErr);
  }

  return res.status(200).json(summary);
}
