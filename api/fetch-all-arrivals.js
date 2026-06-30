import { kv } from '@vercel/kv';
import { DESTINATIONS, PEER_DESTINATIONS, EDITORIAL_BLURBS } from '../destinations.config.js';

const TIMEOUT_MS = 25_000;
// Each AeroAPI page holds ~15 arrivals. The default ceiling gives every single
// airport roughly the same headroom (~300 arrivals/day) that a two-airport
// destination like the Hamptons enjoys, so dense single-airport hubs are not
// artificially capped. max_pages is a ceiling, not a fixed fetch: AeroAPI only
// returns pages that actually contain data, so this is self-limiting and adds
// no cost for the many low-traffic destinations.
const GA_MAX_PAGES_DEFAULT = 20;
const GA_MAX_PAGES_HARD_MAX = 40;
const AIRLINE_CONTEXT_MAX_PAGES = Number(process.env.AIRLINE_CONTEXT_MAX_PAGES || 1);

function parseGaMaxPages() {
  const raw = process.env.GA_MAX_PAGES;
  if (raw == null || String(raw).trim() === '') return GA_MAX_PAGES_DEFAULT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.warn(
      `[fetch-all-arrivals] Invalid GA_MAX_PAGES=${JSON.stringify(raw)}, using default ${GA_MAX_PAGES_DEFAULT}`,
    );
    return GA_MAX_PAGES_DEFAULT;
  }
  if (n > GA_MAX_PAGES_HARD_MAX) {
    console.warn(
      `[fetch-all-arrivals] GA_MAX_PAGES=${n} exceeds hard max ${GA_MAX_PAGES_HARD_MAX}, capping`,
    );
    return GA_MAX_PAGES_HARD_MAX;
  }
  return n;
}

const GA_MAX_PAGES = parseGaMaxPages();

// Allow a destination to opt into a higher page ceiling via `gaMaxPages` in
// destinations.config.js. Used for the densest single-airport hubs (e.g. Oahu,
// Maldives) whose daily private-arrival volume exceeds the standard ceiling and
// would otherwise be capped/truncated and excluded from the daily arrivals chart.
function resolveGaMaxPages(dest) {
  const override = dest && dest.gaMaxPages;
  if (override == null) return GA_MAX_PAGES;
  const n = Number(override);
  if (!Number.isInteger(n) || n < 1) {
    console.warn(
      `[fetch-all-arrivals] Invalid gaMaxPages=${JSON.stringify(override)} for ${dest?.id}, using ${GA_MAX_PAGES}`,
    );
    return GA_MAX_PAGES;
  }
  return Math.min(Math.max(n, GA_MAX_PAGES), GA_MAX_PAGES_HARD_MAX);
}

const HISTORY_VERSION = 'ga_filtered_v2';

const PREMIUM_PRIVATE_PREFIXES = [
  'GLF', 'GLEX', 'G650', 'G550', 'G600', 'G700', 'C25', 'C56', 'C68', 'C75',
  'CL30', 'CL35', 'CL60', 'FA7X', 'F2TH', 'LJ', 'E50P', 'E55P', 'E75L', 'H25B', 'BE40',
];
const TURBOPROP_PREFIXES = ['PC12', 'TBM', 'BE9L', 'B350', 'B300', 'C208'];
const LIGHT_GA_PREFIXES = ['C172', 'C182', 'PA28', 'SR20', 'SR22'];

function formatAeroTime(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function countAirportIcaos() {
  let n = 0;
  for (const d of DESTINATIONS) {
    n += Array.isArray(d.icao) ? d.icao.length : 0;
  }
  return n;
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

function isLoopFlight(flight) {
  const o = flight?.origin?.code_icao;
  const d = flight?.destination?.code_icao;
  return o && d && o === d;
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
      m.set(key, { type: key, count: 0, ga_count: 0 });
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

function dedupeFlightsByFaId(flights) {
  const seen = new Set();
  const out = [];
  for (const f of flights) {
    const id = f?.fa_flight_id || f?.ident;
    if (id) {
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(f);
  }
  return out;
}

function flightTimeMs(flight) {
  const candidates = [
    flight?.actual_on,
    flight?.estimated_on,
    flight?.scheduled_on,
    flight?.arrival_time,
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
      arrival_time: f?.actual_on || f?.estimated_on || f?.scheduled_on || f?.arrival_time || null,
      callsign: f?.ident || f?.ident_icao || null,
      aircraft_type: f?.aircraft_type || null,
      origin_icao: f?.origin?.code_icao || null,
      origin_name: f?.origin?.name || f?.origin?.city || null,
      is_general_aviation: true,
    }));
}

function analyzeGaArrivals(gaArrivals) {
  let premium_private_arrivals_24h = 0;
  let light_ga_arrivals_24h = 0;
  let turbopropCount = 0;
  let unknownCount = 0;
  let excluded_arrivals_24h = 0;
  let qualifiedSum = 0;

  for (const f of gaArrivals) {
    if (isLoopFlight(f)) {
      excluded_arrivals_24h += 1;
      continue;
    }
    const bucket = classifyAircraftBucket(f?.aircraft_type);
    if (bucket === 'premium_private') premium_private_arrivals_24h += 1;
    else if (bucket === 'light_ga') light_ga_arrivals_24h += 1;
    else if (bucket === 'turboprop') turbopropCount += 1;
    else unknownCount += 1;

    let weight = 0;
    if (bucket === 'premium_private') weight = 1;
    else if (bucket === 'turboprop') weight = 1;
    else if (bucket === 'unknown') weight = 0.5;
    else if (bucket === 'light_ga') weight = 0.25;
    qualifiedSum += weight;
  }

  const weighted_private_signal_24h = Math.round(qualifiedSum * 10) / 10;

  return {
    raw_ga_arrivals_24h: gaArrivals.length,
    weighted_private_signal_24h,
    // Backward-compatible alias for historical snapshots
    qualified_private_arrivals_24h: weighted_private_signal_24h,
    premium_private_arrivals_24h,
    light_ga_arrivals_24h,
    excluded_arrivals_24h,
    turboprop_arrivals_24h: turbopropCount,
    unknown_ga_arrivals_24h: unknownCount,
  };
}

function aircraftQualityScore(dest) {
  const raw = _safeNum(dest.raw_ga_arrivals_24h);
  if (raw <= 0) return 0;
  const premium = _safeNum(dest.premium_private_arrivals_24h);
  const turboprop = _safeNum(dest.turboprop_arrivals_24h);
  return Math.min(100, Math.round(((premium * 1.0 + turboprop * 0.7) / raw) * 100));
}

function originQualityScore(dest) {
  const origins = Array.isArray(dest.top_origins) ? dest.top_origins : [];
  if (origins.length === 0) return 0;
  const unique = origins.length;
  const topShare = origins[0]?.count ? origins[0].count / Math.max(1, _safeNum(dest.raw_ga_arrivals_24h)) : 1;
  const diversity = Math.min(100, unique * 18);
  const concentrationPenalty = topShare > 0.7 ? 20 : topShare > 0.5 ? 10 : 0;
  return Math.max(0, Math.min(100, diversity - concentrationPenalty));
}

function _safeNum(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function weightedPrivateSignal24h(dest) {
  if (!dest) return 0;
  return _safeNum(dest.weighted_private_signal_24h ?? dest.qualified_private_arrivals_24h);
}

function pctChange(current, baseline) {
  if (baseline == null || current == null) return null;
  if (baseline === 0) return current > 0 ? null : 0;
  return ((current - baseline) / baseline) * 100;
}

function formatDisplayChange(current, baseline, pct) {
  if (baseline == null || current == null) return 'Clean baseline building';
  if (baseline === 0 && current > 0) return 'New private movement';
  const delta = current - baseline;
  if (baseline >= 5 && pct != null) {
    const sign = pct > 0 ? '+' : '';
    return `${sign}${Math.round(pct)}%`;
  }
  if (baseline >= 1 && baseline <= 4) {
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta} vs prior`;
  }
  if (baseline === 0) return 'New private movement';
  return 'Clean baseline building';
}

function normalizePctForScore(pct) {
  if (pct == null || !Number.isFinite(pct)) return 50;
  const clamped = Math.max(-80, Math.min(120, pct));
  return Math.round(50 + clamped / 2);
}

function statusFromSignal(score, hasHistory, qualified, dodPct, wowPct) {
  if (!hasHistory) {
    if (qualified >= 8) return 'warming';
    if (qualified >= 3) return 'data_building';
    return 'data_building';
  }
  if (score >= 78) return 'heating';
  if (score >= 62) return 'warming';
  if (score >= 48) return 'steady';
  if (score >= 35) {
    if (dodPct != null && dodPct < -15) return 'softening';
    if (wowPct != null && wowPct < -20) return 'cooling';
    return 'softening';
  }
  if (qualified <= 0) return 'off_season';
  return 'cooling';
}

function statusLabel(status) {
  const labels = {
    heating: 'Heating',
    warming: 'Warming',
    steady: 'Steady',
    softening: 'Softening',
    cooling: 'Cooling',
    sleeper: 'Sleeper signal',
    off_season: 'Off season',
    data_building: 'Baseline building',
  };
  return labels[status] || status;
}

function commercialBackdrop(airlineOk, airlineCount, airlineHasMore) {
  if (!airlineOk) {
    return {
      commercial_backdrop_tier: 'unknown',
      commercial_backdrop_label: 'Commercial backdrop unknown',
      commercial_exact: false,
    };
  }
  if (airlineCount === 0 && !airlineHasMore) {
    return {
      commercial_backdrop_tier: 'light',
      commercial_backdrop_label: 'Commercial backdrop light',
      commercial_exact: true,
    };
  }
  if (airlineHasMore) {
    return {
      commercial_backdrop_tier: 'high_volume',
      commercial_backdrop_label: 'High-volume commercial airport',
      commercial_exact: false,
    };
  }
  return {
    commercial_backdrop_tier: 'active',
    commercial_backdrop_label: 'Commercial backdrop active',
    commercial_exact: true,
  };
}

function isV2HistoryRecord(rec) {
  return rec?.history_version === HISTORY_VERSION;
}

function calendarDateUtc(iso) {
  if (!iso) return null;
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function shiftCalendarDateUtc(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function calendarDaysBefore(dateStr, todayStr) {
  const a = new Date(`${dateStr}T12:00:00.000Z`).getTime();
  const b = new Date(`${todayStr}T12:00:00.000Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function findHistoryForDestination(historyList, destId, now = new Date()) {
  const v2 = historyList.filter(isV2HistoryRecord);
  const byDest = (rec) => {
    const row = rec?.per_destination?.find((p) => p.id === destId);
    return row || null;
  };

  const today = calendarDateUtc(now.toISOString());
  const yesterday = shiftCalendarDateUtc(today, -1);
  const weekTarget = shiftCalendarDateUtc(today, -7);

  let priorDay = null;
  for (const rec of v2) {
    const recDate = calendarDateUtc(rec?.saved_at);
    if (recDate !== yesterday) continue;
    priorDay = byDest(rec);
    if (priorDay) break;
  }

  let weekAgo = null;
  for (const rec of v2) {
    const recDate = calendarDateUtc(rec?.saved_at);
    if (recDate !== weekTarget) continue;
    weekAgo = byDest(rec);
    if (weekAgo) break;
  }
  if (!weekAgo) {
    for (const rec of v2) {
      const recDate = calendarDateUtc(rec?.saved_at);
      if (!recDate) continue;
      const daysBack = calendarDaysBefore(recDate, today);
      if (daysBack >= 6 && daysBack <= 8) {
        weekAgo = byDest(rec);
        if (weekAgo) break;
      }
    }
  }

  return { priorDay, weekAgo, hasV2: v2.length > 0 };
}

function computeMovementMetrics(dest, histCtx) {
  const current = weightedPrivateSignal24h(dest);
  const { priorDay, weekAgo, hasV2 } = histCtx;

  let dod_change_pct = null;
  let wow_change_pct = null;
  let display_dod_change = 'Baseline building';
  let display_wow_change = 'Baseline building';

  if (priorDay) {
    const base = weightedPrivateSignal24h(priorDay);
    dod_change_pct = pctChange(current, base);
    display_dod_change = formatDisplayChange(current, base, dod_change_pct);
  }

  if (weekAgo) {
    const base = weightedPrivateSignal24h(weekAgo);
    wow_change_pct = pctChange(current, base);
    display_wow_change = formatDisplayChange(current, base, wow_change_pct);
  }

  return {
    dod_change_pct,
    wow_change_pct,
    display_dod_change,
    display_wow_change,
    hasCleanHistory: Boolean(priorDay || weekAgo),
  };
}

function computeSignalScore(dest, movement, hasHistory) {
  const qualified = weightedPrivateSignal24h(dest);
  const acQuality = aircraftQualityScore(dest);
  const origQuality = originQualityScore(dest);

  if (hasHistory) {
    const dodScore = normalizePctForScore(movement.dod_change_pct);
    const wowScore = normalizePctForScore(movement.wow_change_pct);
    const volumeScore = Math.min(100, Math.round((qualified / 20) * 100));
    const momentum = movement.wow_change_pct != null
      ? normalizePctForScore(movement.wow_change_pct)
      : dodScore;

    const score = Math.round(
      wowScore * 0.4 +
      dodScore * 0.3 +
      momentum * 0.15 +
      acQuality * 0.1 +
      origQuality * 0.05,
    );
    return Math.max(0, Math.min(100, score));
  }

  const volumeScore = Math.min(100, Math.round((qualified / 15) * 100));
  const confidence = dest.ok ? 0.85 : 0.5;
  const provisional = Math.round(
    volumeScore * 0.5 + acQuality * 0.25 + origQuality * 0.15 + 10 * confidence,
  );
  return Math.max(0, Math.min(100, provisional));
}

function applySignalDepthGuard(rawScore, metrics) {
  const normalizedRaw = Math.max(0, Math.min(100, _safeNum(rawScore)));
  const roundedRaw = Math.round(normalizedRaw);

  const privateArrivals24h = _safeNum(
    metrics?.private_arrivals_24h ??
    metrics?.raw_ga_arrivals_24h ??
    metrics?.raw_private_arrivals_24h,
  );
  const origins = Array.isArray(metrics?.top_origins) ? metrics.top_origins : [];
  const originCount = origins.length;

  let cap = null;
  let reason = null;

  if (roundedRaw >= 75) {
    if (privateArrivals24h >= 5 || originCount >= 4) {
      cap = null;
    } else if (privateArrivals24h <= 2 && originCount <= 2) {
      cap = 72;
      reason = 'thin_private_and_origin_breadth';
    } else if (privateArrivals24h <= 4 && originCount <= 2) {
      cap = 78;
      reason = 'thin_private_narrow_origins';
    } else if (privateArrivals24h <= 4 && originCount <= 3) {
      cap = 84;
      reason = 'modest_private_limited_origins';
    }
  }

  const finalScore = cap == null ? roundedRaw : Math.min(roundedRaw, cap);
  const boundedFinal = Math.max(0, Math.min(100, Math.round(finalScore)));
  const capApplied = cap != null && boundedFinal < roundedRaw;

  let signalConfidence = 'confirmed';
  if (capApplied) {
    if (privateArrivals24h <= 2 && originCount <= 2) signalConfidence = 'thin';
    else signalConfidence = 'developing';
  }

  return {
    finalScore: boundedFinal,
    capApplied,
    cap: capApplied ? cap : null,
    reason: capApplied ? reason : null,
    confidence: signalConfidence,
  };
}

function algorithmRead(dest) {
  const parts = [];
  parts.push(`GA raw ${dest.raw_ga_arrivals_24h}`);
  parts.push(`signal ${weightedPrivateSignal24h(dest)}`);
  if (dest.commercial_backdrop_label) parts.push(dest.commercial_backdrop_label);
  return parts.join(' · ');
}

async function fetchArrivalsForAirport(icao, apiKey, start, end, { type, maxPages }) {
  const base = `https://aeroapi.flightaware.com/aeroapi/airports/${encodeURIComponent(icao)}/flights/arrivals`;
  const params = new URLSearchParams({
    start,
    end,
    max_pages: String(maxPages),
    type,
  });
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
      hasMore: false,
      numPages: null,
      requestedMaxPages: maxPages,
      rawRecordCount: 0,
      filteredRecordCount: 0,
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
      hasMore: false,
      numPages: null,
      requestedMaxPages: maxPages,
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
      requestedMaxPages: maxPages,
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
      requestedMaxPages: maxPages,
      rawRecordCount: 0,
      filteredRecordCount: 0,
      error: 'invalid_arrivals_array',
    };
  }

  const expectedType = type;
  const filtered = rawArrivals.filter((f) => f?.type === expectedType);
  if (filtered.length !== rawArrivals.length) {
    console.warn(
      `[fetch-all-arrivals] Type filter mismatch ${icao} type=${type}: raw=${rawArrivals.length} filtered=${filtered.length}`,
    );
  }

  const numPages =
    typeof body?.num_pages === 'number' && Number.isFinite(body.num_pages) && body.num_pages >= 1
      ? body.num_pages
      : null;
  const hasMore = Boolean(body?.links?.next);
  return {
    ok: true,
    arrivals: filtered,
    hasMore,
    numPages,
    requestedMaxPages: maxPages,
    rawRecordCount: rawArrivals.length,
    filteredRecordCount: filtered.length,
    error: null,
  };
}

async function processDestination(dest, apiKey, start, end, totalApiCalls, fetchStats) {
  const icaos = Array.isArray(dest.icao) ? dest.icao : [];
  const errors = [];
  let gaCombined = [];
  let airlineCombined = [];
  let anyGaOk = false;
  let anyAirlineOk = false;
  let airlineHasMore = false;
  const destGaMaxPages = resolveGaMaxPages(dest);
  const gaPagination = {
    pageLimit: destGaMaxPages,
    pagesReturned: 0,
    rawRecordCount: 0,
    hasMoreRemaining: false,
    truncated: false,
  };

  console.log(`[fetch-all-arrivals] Destination start: ${dest.id} (${dest.name})`);

  for (const icao of icaos) {
    try {
      totalApiCalls.count += 1;
      const gaRes = await fetchArrivalsForAirport(icao, apiKey, start, end, {
        type: 'General_Aviation',
        maxPages: destGaMaxPages,
      });
      if (gaRes.ok) {
        anyGaOk = true;
        gaCombined = gaCombined.concat(gaRes.arrivals);
        gaPagination.rawRecordCount += gaRes.rawRecordCount;
        if (gaRes.numPages != null) {
          gaPagination.pagesReturned += gaRes.numPages;
        } else if (gaRes.rawRecordCount > 0) {
          gaPagination.pagesReturned += 1;
        }
        if (gaRes.hasMore) {
          gaPagination.hasMoreRemaining = true;
          gaPagination.truncated = true;
          fetchStats.gaHasMore += 1;
        }
        console.log(
          `[fetch-all-arrivals] GA ${icao} (${dest.id}): page_limit=${destGaMaxPages} pages_returned=${gaRes.numPages ?? 'unknown'} raw_records=${gaRes.rawRecordCount} filtered_ga=${gaRes.filteredRecordCount} has_more=${gaRes.hasMore} truncated=${gaRes.hasMore}`,
        );
      } else {
        errors.push({ icao, type: 'General_Aviation', error: gaRes.error });
        console.warn(
          `[fetch-all-arrivals] GA ${icao} (${dest.id}) failed: ${gaRes.error}`,
        );
      }
    } catch (err) {
      console.error(`[fetch-all-arrivals] GA fetch threw: ${dest.id} ${icao}`, err);
      errors.push({
        icao,
        type: 'General_Aviation',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      totalApiCalls.count += 1;
      const airlineRes = await fetchArrivalsForAirport(icao, apiKey, start, end, {
        type: 'Airline',
        maxPages: AIRLINE_CONTEXT_MAX_PAGES,
      });
      if (airlineRes.ok) {
        anyAirlineOk = true;
        airlineCombined = airlineCombined.concat(airlineRes.arrivals);
        if (airlineRes.hasMore) {
          airlineHasMore = true;
          fetchStats.airlineHasMore += 1;
        }
      } else {
        errors.push({ icao, type: 'Airline', error: airlineRes.error });
      }
    } catch (err) {
      console.error(`[fetch-all-arrivals] Airline fetch threw: ${dest.id} ${icao}`, err);
      errors.push({
        icao,
        type: 'Airline',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const gaBeforeDedup = gaCombined.length;
  gaCombined = dedupeFlightsByFaId(gaCombined);
  if (gaCombined.length !== gaBeforeDedup) {
    console.log(
      `[fetch-all-arrivals] Deduped GA arrivals for ${dest.id}: before=${gaBeforeDedup} after=${gaCombined.length}`,
    );
  }

  const destOk = anyGaOk;
  const gaMetrics = analyzeGaArrivals(gaCombined);
  const airline_context_count = anyAirlineOk ? airlineCombined.length : 0;
  const backdrop = commercialBackdrop(anyAirlineOk, airline_context_count, airlineHasMore);

  const weighted_private_signal_24h = destOk ? gaMetrics.weighted_private_signal_24h : 0;
  const raw_ga_arrivals_24h = destOk ? gaMetrics.raw_ga_arrivals_24h : 0;
  const arrival_count_truncated = destOk && gaPagination.truncated;
  const arrival_count_minimum = arrival_count_truncated ? raw_ga_arrivals_24h : null;

  if (destOk) {
    console.log(
      `[fetch-all-arrivals] GA summary ${dest.id}: page_limit=${gaPagination.pageLimit} pages_returned=${gaPagination.pagesReturned} raw_records=${gaPagination.rawRecordCount} filtered_ga=${raw_ga_arrivals_24h} has_more=${gaPagination.hasMoreRemaining} truncated=${arrival_count_truncated}`,
    );
  }

  const result = {
    id: dest.id,
    name: dest.name,
    region: dest.region,
    lat: dest.lat,
    lng: dest.lng,
    icao: [...icaos],
    ok: destOk,
    arrivals_count: raw_ga_arrivals_24h,
    private_arrivals_24h: raw_ga_arrivals_24h,
    general_aviation_count: raw_ga_arrivals_24h,
    commercial_count: airline_context_count,
    unknown_type_count: 0,
    raw_ga_arrivals_24h,
    weighted_private_signal_24h,
    qualified_private_arrivals_24h: weighted_private_signal_24h,
    premium_private_arrivals_24h: destOk ? gaMetrics.premium_private_arrivals_24h : 0,
    light_ga_arrivals_24h: destOk ? gaMetrics.light_ga_arrivals_24h : 0,
    excluded_arrivals_24h: destOk ? gaMetrics.excluded_arrivals_24h : 0,
    turboprop_arrivals_24h: destOk ? gaMetrics.turboprop_arrivals_24h : 0,
    unknown_ga_arrivals_24h: destOk ? gaMetrics.unknown_ga_arrivals_24h : 0,
    arrival_count_truncated,
    arrival_count_page_limit: gaPagination.pageLimit,
    arrival_count_pages_returned: gaPagination.pagesReturned,
    arrival_count_minimum,
    airline_context_count,
    airline_has_more: airlineHasMore,
    ...backdrop,
    top_origins: destOk ? topOriginsFromArrivals(gaCombined) : [],
    top_aircraft: destOk ? aircraftBreakdownFromArrivals(gaCombined) : [],
    recent_flights: destOk ? recentFlightsFromArrivals(gaCombined) : [],
    sample_flight: gaCombined.length > 0 ? gaCombined[0] : null,
    errors,
    fetched_at: new Date().toISOString(),
    editorial: EDITORIAL_BLURBS[dest.id] || null,
    peers: PEER_DESTINATIONS[dest.id] || [],
    signal_score: 0,
    status: 'data_building',
    status_label: 'Baseline building',
    dod_change_pct: null,
    wow_change_pct: null,
    display_dod_change: 'Clean baseline building',
    display_wow_change: 'Clean baseline building',
    algorithm_read: '',
    data_quality: destOk ? 'ga_filtered' : 'fetch_failed',
  };

  const errTag = result.errors.length ? ` errors=${result.errors.length}` : '';
  console.log(
    `[fetch-all-arrivals] Destination done: ${dest.id} ok=${destOk} weighted_signal=${weighted_private_signal_24h} raw_ga=${raw_ga_arrivals_24h} airline=${airline_context_count} truncated=${arrival_count_truncated}${errTag}`,
  );

  return result;
}

function enrichDestinationsWithHistory(destinations, historyList) {
  return destinations.map((dest) => {
    const histCtx = findHistoryForDestination(historyList, dest.id);
    const movement = computeMovementMetrics(dest, histCtx);
    const hasHistory = histCtx.hasV2 && (histCtx.priorDay != null || histCtx.weekAgo != null);
    const rawSignalScore = computeSignalScore(dest, movement, hasHistory);
    const guardedSignal = applySignalDepthGuard(rawSignalScore, dest);
    const signal_score = guardedSignal.finalScore;
    const status = statusFromSignal(
      signal_score,
      hasHistory,
      weightedPrivateSignal24h(dest),
      movement.dod_change_pct,
      movement.wow_change_pct,
    );

    return {
      ...dest,
      ...movement,
      signal_score,
      raw_signal_score: rawSignalScore,
      signal_depth_cap_applied: guardedSignal.capApplied,
      signal_depth_cap: guardedSignal.cap,
      signal_depth_reason: guardedSignal.reason,
      signal_confidence: guardedSignal.confidence,
      status,
      status_label: statusLabel(status),
      algorithm_read: algorithmRead(dest),
      data_quality: dest.ok ? (hasHistory ? 'ga_filtered_v2' : 'baseline_building') : 'fetch_failed',
    };
  });
}

function buildHomepage(destinations) {
  const okDests = destinations.filter((d) => d.ok);

  const heating_up = okDests
    .filter((d) => ['heating', 'warming', 'sleeper'].includes(d.status))
    .sort((a, b) => _safeNum(b.signal_score) - _safeNum(a.signal_score))
    .slice(0, 6);

  const cooling_down = okDests
    .filter((d) => d.status === 'cooling' || d.status === 'softening')
    .sort((a, b) => _safeNum(a.signal_score) - _safeNum(b.signal_score))
    .slice(0, 3);

  const heatingIds = new Set(heating_up.map((d) => d.id));

  function sleeperScore(d) {
    let score = _safeNum(d.signal_score) * 0.35;
    const weightedSignal = weightedPrivateSignal24h(d);
    if (weightedSignal > 0 && weightedSignal <= 12) score += 15;
    if (d.dod_change_pct != null && d.dod_change_pct > 0) score += Math.min(20, d.dod_change_pct);
    if (d.wow_change_pct != null && d.wow_change_pct > 0) score += Math.min(15, d.wow_change_pct * 0.5);
    score += aircraftQualityScore(d) * 0.1;
    score += originQualityScore(d) * 0.1;
    if (d.commercial_backdrop_tier === 'light') score += 8;
    else if (d.commercial_backdrop_tier === 'active') score += 4;
    if (weightedSignal > 20) score -= 10;
    return score;
  }

  const sleeperCandidates = okDests
    .filter((d) => !heatingIds.has(d.id) && weightedPrivateSignal24h(d) > 0)
    .sort((a, b) => sleeperScore(b) - sleeperScore(a));

  let sleeper_pick = sleeperCandidates[0] || null;
  if (sleeper_pick) {
    const noteParts = [];
    if (weightedPrivateSignal24h(sleeper_pick) <= 12) {
      noteParts.push('Private activity remains modest, but the signal is building from a low base.');
    } else {
      noteParts.push('Private activity is present with emerging momentum relative to peers.');
    }
    const originCount = Array.isArray(sleeper_pick.top_origins) ? sleeper_pick.top_origins.length : 0;
    if (originCount >= 2) {
      noteParts.push('The current movement is supported by private arrivals and origin diversity,');
    } else {
      noteParts.push('The current movement is supported by private arrivals,');
    }
    noteParts.push(
      `while commercial traffic remains only a backdrop (${String(sleeper_pick.commercial_backdrop_label || 'context only').toLowerCase()}).`,
    );
    sleeper_pick = {
      ...sleeper_pick,
      editorial_note: noteParts.join(' '),
    };
  }

  const total_private_arrivals_24h = destinations.reduce(
    (s, d) => s + _safeNum(d.raw_ga_arrivals_24h),
    0,
  );
  const total_qualified_private_arrivals_24h = destinations.reduce(
    (s, d) => s + weightedPrivateSignal24h(d),
    0,
  );
  const total_weighted_private_signal_24h = total_qualified_private_arrivals_24h;

  const heating_count = destinations.filter(
    (d) => d.ok && (d.status === 'heating' || d.status === 'warming'),
  ).length;
  const cooling_count = destinations.filter(
    (d) => d.ok && (d.status === 'cooling' || d.status === 'softening'),
  ).length;
  const moving_count = destinations.filter(
    (d) => d.ok && ['heating', 'warming', 'sleeper'].includes(d.status),
  ).length;

  return {
    heating_up,
    cooling_down,
    sleeper_pick,
    totals: {
      total_destinations: DESTINATIONS.length,
      total_airport_ids: countAirportIcaos(),
      total_private_arrivals_24h,
      total_qualified_private_arrivals_24h,
      total_weighted_private_signal_24h,
      heating_count,
      cooling_count,
      moving_count,
      data_building_count: destinations.filter((d) => d.status === 'data_building').length,
      last_updated_at: new Date().toISOString(),
    },
  };
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
    const fetchStats = { gaHasMore: 0, airlineHasMore: 0 };
    const totalDestinations = DESTINATIONS.length;
    const totalAirportIds = countAirportIcaos();
    const fetchesPerRun = totalAirportIds * 2;
    const estimatedMaxResultSets = DESTINATIONS.reduce((sum, dest) => {
      const airports = Array.isArray(dest.icao) ? dest.icao.length : 0;
      return sum + airports * (resolveGaMaxPages(dest) + AIRLINE_CONTEXT_MAX_PAGES);
    }, 0);
    const estimatedMonthlyResultSets = estimatedMaxResultSets * 30;

    console.log(
      `[fetch-all-arrivals] Processing ${totalDestinations} destinations (${totalAirportIds} airport ICAOs) start=${start} end=${end} GA_MAX_PAGES=${GA_MAX_PAGES} AIRLINE_CONTEXT_MAX_PAGES=${AIRLINE_CONTEXT_MAX_PAGES}`,
    );
    console.log(
      `[fetch-all-arrivals] Estimated max result sets this run: ${estimatedMaxResultSets}; ~monthly at daily refresh: ${estimatedMonthlyResultSets}`,
    );

    let historyList = [];
    try {
      const rawHistory = await kv.lrange('gotango:arrivals:history', 0, 29);
      historyList = Array.isArray(rawHistory) ? rawHistory : [];
    } catch (histReadErr) {
      console.warn('[fetch-all-arrivals] Could not read history for movement:', histReadErr);
    }

    const destinationPromises = DESTINATIONS.map((dest) =>
      processDestination(dest, apiKey, start, end, totalApiCalls, fetchStats),
    );
    let destinations = await Promise.all(destinationPromises);
    destinations = enrichDestinationsWithHistory(destinations, historyList);
    const homepage = buildHomepage(destinations);

    const successful = destinations.filter((d) => d.ok).length;
    const failed = destinations.filter((d) => !d.ok).length;
    const total_arrivals_across_all = destinations.reduce(
      (s, d) => s + _safeNum(d.raw_ga_arrivals_24h),
      0,
    );
    const fetched_at = new Date().toISOString();
    const duration_ms = Date.now() - t0;

    console.log(
      `[fetch-all-arrivals] Summary: destinations=${totalDestinations} airports=${totalAirportIds} successful=${successful} failed=${failed} qualified_total=${total_arrivals_across_all} api_calls=${totalApiCalls.count} ga_has_more=${fetchStats.gaHasMore} airline_has_more=${fetchStats.airlineHasMore} heating=${homepage.heating_up.length} cooling=${homepage.cooling_down.length} sleeper=${homepage.sleeper_pick?.id || 'none'} duration_ms=${duration_ms}`,
    );

    const responseBody = {
      ok: true,
      total_destinations: totalDestinations,
      successful,
      failed,
      total_arrivals_across_all,
      total_api_calls_made: totalApiCalls.count,
      fetched_at,
      duration_ms,
      destinations,
      homepage,
      kv_saved: false,
      history_appended: false,
    };

    const okDestinationCount = destinations.filter((d) => d.ok).length;
    const minimumOk = Math.max(1, Math.floor(totalDestinations * 0.7));
    const sanityOkDestinations = okDestinationCount >= minimumOk;
    const sanityTotalArrivals = total_arrivals_across_all > 0;

    if (!sanityOkDestinations || !sanityTotalArrivals) {
      const parts = [];
      if (!sanityOkDestinations) {
        parts.push(
          `only ${okDestinationCount} of ${totalDestinations} destinations have ok: true (need at least ${minimumOk})`,
        );
      }
      if (!sanityTotalArrivals) {
        parts.push('total qualified private arrivals is not greater than 0');
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

      if (total_arrivals_across_all > 0 && okDestinationCount >= minimumOk) {
        try {
          const historyKey = 'gotango:arrivals:history';
          const per_destination = destinations.map((d) => ({
            id: d.id,
            date: savedAt.slice(0, 10),
            saved_at: savedAt,
            raw_ga_arrivals_24h: d.raw_ga_arrivals_24h,
            weighted_private_signal_24h: d.weighted_private_signal_24h,
            qualified_private_arrivals_24h: d.qualified_private_arrivals_24h,
            private_arrivals_24h: d.private_arrivals_24h,
            premium_private_arrivals_24h: d.premium_private_arrivals_24h,
            light_ga_arrivals_24h: d.light_ga_arrivals_24h,
            excluded_arrivals_24h: d.excluded_arrivals_24h,
            airline_context_count: d.airline_context_count,
            airline_has_more: d.airline_has_more,
            commercial_backdrop_tier: d.commercial_backdrop_tier,
            signal_score: d.signal_score,
            status: d.status,
            top_origins: d.top_origins,
            top_aircraft: d.top_aircraft,
            arrivals_count: d.arrivals_count,
            general_aviation_count: d.general_aviation_count,
            commercial_count: d.commercial_count,
            arrival_count_truncated: d.arrival_count_truncated,
            arrival_count_page_limit: d.arrival_count_page_limit,
            arrival_count_pages_returned: d.arrival_count_pages_returned,
            arrival_count_minimum: d.arrival_count_minimum,
          }));
          const historyRecord = {
            history_version: HISTORY_VERSION,
            saved_at: savedAt,
            total_arrivals: total_arrivals_across_all,
            successful_count: successful,
            duration_ms,
            per_destination,
          };
          const sizeBeforePush = await kv.llen(historyKey);
          console.log(
            `Appending ga_filtered_v2 history (size before trim: ${sizeBeforePush + 1})...`,
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
