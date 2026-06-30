#!/usr/bin/env node
/**
 * Backfill FlightAware GA arrival history for expansion destinations.
 *
 * Fetches prior daily windows from AeroAPI and patches gotango:arrivals:history
 * with per_destination rows for new destinations only (existing rows untouched).
 *
 * Usage:
 *   node scripts/backfill-expansion-arrivals.mjs --dry-run
 *   node scripts/backfill-expansion-arrivals.mjs --write
 *   node scripts/backfill-expansion-arrivals.mjs --write --days=5 --only grand-cayman,maui
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kv } from '@vercel/kv';
import { DESTINATIONS } from '../destinations.config.js';
import { EXPANSION_2026_DESTINATION_IDS } from './expansion-destination-ids.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HISTORY_KEY = 'gotango:arrivals:history';
const HISTORY_VERSION = 'ga_filtered_v2';
const TIMEOUT_MS = 25_000;
const GA_MAX_PAGES = 3;
const AIRLINE_MAX_PAGES = 1;
const FETCH_DELAY_MS = 350;

const PREMIUM_PRIVATE_PREFIXES = [
  'GLF', 'GLEX', 'G650', 'G550', 'G600', 'G700', 'C25', 'C56', 'C68', 'C75',
  'CL30', 'CL35', 'CL60', 'FA7X', 'F2TH', 'LJ', 'E50P', 'E55P', 'E75L', 'H25B', 'BE40',
];
const TURBOPROP_PREFIXES = ['PC12', 'TBM', 'BE9L', 'B350', 'B300', 'C208'];
const LIGHT_GA_PREFIXES = ['C172', 'C182', 'PA28', 'SR20', 'SR22'];

const WRITE = process.argv.includes('--write');
const DRY_RUN = !WRITE;
const DAYS = parseDaysArg();
const ONLY_IDS = parseOnlyArg();

function parseDaysArg() {
  const raw = process.argv.find((a) => a.startsWith('--days='));
  if (!raw) return 7;
  const n = Number(raw.split('=')[1]);
  if (!Number.isInteger(n) || n < 1 || n > 14) {
    die('--days must be an integer from 1 to 14');
  }
  return n;
}

function parseOnlyArg() {
  const idx = process.argv.indexOf('--only');
  if (idx === -1) return null;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith('--')) die('--only requires a comma-separated id list');
  return new Set(val.split(',').map((s) => s.trim()).filter(Boolean));
}

function die(message) {
  console.error(message);
  process.exit(1);
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key] && val) process.env[key] = val;
  }
}

function loadEnv() {
  loadEnvFile(join(ROOT, '.env.local'));
  loadEnvFile(join(ROOT, '.vercel/.env.production.local'));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function isLoopFlight(flight) {
  const o = flight?.origin?.code_icao;
  const d = flight?.destination?.code_icao;
  return o && d && o === d;
}

function topOriginsFromArrivals(arrivals) {
  const m = new Map();
  for (const f of arrivals) {
    const o = f?.origin;
    const code = o?.code_icao || o?.code || 'UNKNOWN';
    const name = o?.name || o?.city || code;
    if (!m.has(code)) m.set(code, { code, name, count: 0 });
    m.get(code).count += 1;
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

function aircraftBreakdownFromArrivals(arrivals) {
  const m = new Map();
  for (const f of arrivals) {
    const t = f?.aircraft_type;
    const key = t && String(t).trim() ? String(t).trim() : 'UNKNOWN';
    if (!m.has(key)) m.set(key, { type: key, count: 0, ga_count: 0 });
    const entry = m.get(key);
    entry.count += 1;
    if (f?.type === 'General_Aviation') entry.ga_count += 1;
  }
  return [...m.values()]
    .map(({ type, count, ga_count }) => ({ type, count, is_ga: ga_count > 0 }))
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

function analyzeGaArrivals(gaArrivals) {
  let premium_private_arrivals_24h = 0;
  let light_ga_arrivals_24h = 0;
  let turboprop_arrivals_24h = 0;
  let unknown_ga_arrivals_24h = 0;
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
    else if (bucket === 'turboprop') turboprop_arrivals_24h += 1;
    else unknown_ga_arrivals_24h += 1;

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
    qualified_private_arrivals_24h: weighted_private_signal_24h,
    premium_private_arrivals_24h,
    light_ga_arrivals_24h,
    excluded_arrivals_24h,
    turboprop_arrivals_24h,
    unknown_ga_arrivals_24h,
  };
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
  if (airlineCount >= 40) {
    return {
      commercial_backdrop_tier: 'active',
      commercial_backdrop_label: 'Active commercial airport',
      commercial_exact: true,
    };
  }
  return {
    commercial_backdrop_tier: 'moderate',
    commercial_backdrop_label: 'Moderate commercial backdrop',
    commercial_exact: true,
  };
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
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'x-apikey': apiKey.trim() },
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 300);
      } catch {
        /* ignore */
      }
      return { ok: false, arrivals: [], error: detail || `http_${res.status}` };
    }
    const body = await res.json();
    const raw = Array.isArray(body?.arrivals) ? body.arrivals : [];
    const filtered = raw.filter((f) => f?.type === type);
    return {
      ok: true,
      arrivals: filtered,
      hasMore: Boolean(body?.links?.next),
      error: null,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      arrivals: [],
      error: isAbort ? 'timeout' : err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchDestinationWindow(dest, apiKey, start, end) {
  const icaos = Array.isArray(dest.icao) ? dest.icao : [];
  let gaCombined = [];
  let airlineCombined = [];
  let anyGaOk = false;
  let anyAirlineOk = false;
  let airlineHasMore = false;
  let truncated = false;
  const errors = [];

  for (const icao of icaos) {
    const gaRes = await fetchArrivalsForAirport(icao, apiKey, start, end, {
      type: 'General_Aviation',
      maxPages: GA_MAX_PAGES,
    });
    await sleep(FETCH_DELAY_MS);
    if (gaRes.ok) {
      anyGaOk = true;
      gaCombined = gaCombined.concat(gaRes.arrivals);
      if (gaRes.hasMore) truncated = true;
    } else {
      errors.push({ icao, type: 'GA', error: gaRes.error });
    }

    const airlineRes = await fetchArrivalsForAirport(icao, apiKey, start, end, {
      type: 'Airline',
      maxPages: AIRLINE_MAX_PAGES,
    });
    await sleep(FETCH_DELAY_MS);
    if (airlineRes.ok) {
      anyAirlineOk = true;
      airlineCombined = airlineCombined.concat(airlineRes.arrivals);
      if (airlineRes.hasMore) airlineHasMore = true;
    } else {
      errors.push({ icao, type: 'Airline', error: airlineRes.error });
    }
  }

  gaCombined = dedupeFlightsByFaId(gaCombined);
  const gaMetrics = analyzeGaArrivals(gaCombined);
  const backdrop = commercialBackdrop(anyAirlineOk, airlineCombined.length, airlineHasMore);
  const ok = anyGaOk;

  return {
    id: dest.id,
    ok,
    errors,
    raw_ga_arrivals_24h: ok ? gaMetrics.raw_ga_arrivals_24h : 0,
    weighted_private_signal_24h: ok ? gaMetrics.weighted_private_signal_24h : 0,
    qualified_private_arrivals_24h: ok ? gaMetrics.qualified_private_arrivals_24h : 0,
    private_arrivals_24h: ok ? gaMetrics.raw_ga_arrivals_24h : 0,
    premium_private_arrivals_24h: ok ? gaMetrics.premium_private_arrivals_24h : 0,
    light_ga_arrivals_24h: ok ? gaMetrics.light_ga_arrivals_24h : 0,
    excluded_arrivals_24h: ok ? gaMetrics.excluded_arrivals_24h : 0,
    airline_context_count: anyAirlineOk ? airlineCombined.length : 0,
    airline_has_more: airlineHasMore,
    commercial_backdrop_tier: backdrop.commercial_backdrop_tier,
    top_origins: ok ? topOriginsFromArrivals(gaCombined) : [],
    top_aircraft: ok ? aircraftBreakdownFromArrivals(gaCombined) : [],
    arrivals_count: ok ? gaMetrics.raw_ga_arrivals_24h : 0,
    general_aviation_count: ok ? gaMetrics.raw_ga_arrivals_24h : 0,
    commercial_count: anyAirlineOk ? airlineCombined.length : 0,
    arrival_count_truncated: ok && truncated,
    arrival_count_page_limit: GA_MAX_PAGES,
    arrival_count_pages_returned: null,
    arrival_count_minimum: ok && truncated ? gaMetrics.raw_ga_arrivals_24h : null,
    signal_score: ok ? Math.min(100, Math.round(gaMetrics.weighted_private_signal_24h * 4)) : 0,
    status: 'data_building',
  };
}

function buildDayWindows(days) {
  const windows = [];
  for (let offset = 1; offset <= days; offset += 1) {
    const end = new Date();
    end.setUTCHours(14, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() - offset);
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const date = end.toISOString().slice(0, 10);
    windows.push({
      date,
      saved_at: `${date}T14:00:00.000Z`,
      start: formatAeroTime(start),
      end: formatAeroTime(end),
    });
  }
  return windows;
}

function buildPerDestinationRow(metrics, savedAt) {
  return {
    id: metrics.id,
    date: savedAt.slice(0, 10),
    saved_at: savedAt,
    raw_ga_arrivals_24h: metrics.raw_ga_arrivals_24h,
    weighted_private_signal_24h: metrics.weighted_private_signal_24h,
    qualified_private_arrivals_24h: metrics.qualified_private_arrivals_24h,
    private_arrivals_24h: metrics.private_arrivals_24h,
    premium_private_arrivals_24h: metrics.premium_private_arrivals_24h,
    light_ga_arrivals_24h: metrics.light_ga_arrivals_24h,
    excluded_arrivals_24h: metrics.excluded_arrivals_24h,
    airline_context_count: metrics.airline_context_count,
    airline_has_more: metrics.airline_has_more,
    commercial_backdrop_tier: metrics.commercial_backdrop_tier,
    signal_score: metrics.signal_score,
    status: metrics.status,
    top_origins: metrics.top_origins,
    top_aircraft: metrics.top_aircraft,
    arrivals_count: metrics.arrivals_count,
    general_aviation_count: metrics.general_aviation_count,
    commercial_count: metrics.commercial_count,
    arrival_count_truncated: metrics.arrival_count_truncated,
    arrival_count_page_limit: metrics.arrival_count_page_limit,
    arrival_count_pages_returned: metrics.arrival_count_pages_returned,
    arrival_count_minimum: metrics.arrival_count_minimum,
  };
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

function resolveTargets() {
  const ids = ONLY_IDS ? [...ONLY_IDS] : [...EXPANSION_2026_DESTINATION_IDS];
  const byId = new Map(DESTINATIONS.map((d) => [d.id, d]));
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length) die(`Unknown destination id(s): ${unknown.join(', ')}`);
  return ids.map((id) => byId.get(id));
}

async function main() {
  loadEnv();
  const apiKey = process.env.FLIGHTAWARE_API_KEY?.trim();
  if (!apiKey) die('Missing FLIGHTAWARE_API_KEY in .env.local');

  const targets = resolveTargets();
  const windows = buildDayWindows(DAYS);

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (pass --write to persist)' : 'WRITE'}`);
  console.log(`Destinations: ${targets.length}, days: ${DAYS}, windows: ${windows.map((w) => w.date).join(', ')}`);

  /** @type {Map<string, Map<string, object>>} date -> destId -> metrics */
  const fetchedByDate = new Map();
  for (const win of windows) {
    fetchedByDate.set(win.date, new Map());
  }

  for (const dest of targets) {
    for (const win of windows) {
      process.stdout.write(`Fetch ${dest.id} @ ${win.date}... `);
      const metrics = await fetchDestinationWindow(dest, apiKey, win.start, win.end);
      fetchedByDate.get(win.date).set(dest.id, metrics);
      console.log(
        metrics.ok
          ? `ok raw=${metrics.raw_ga_arrivals_24h} signal=${metrics.weighted_private_signal_24h}`
          : `failed (${metrics.errors.map((e) => e.error).join('; ') || 'no data'})`,
      );
    }
  }

  const summary = [];
  for (const dest of targets) {
    let totalRaw = 0;
    let daysWithData = 0;
    for (const win of windows) {
      const m = fetchedByDate.get(win.date).get(dest.id);
      if (m?.ok && m.raw_ga_arrivals_24h > 0) {
        totalRaw += m.raw_ga_arrivals_24h;
        daysWithData += 1;
      }
    }
    summary.push({ id: dest.id, daysWithData, totalRaw });
  }

  console.log('\nSummary (days with GA arrivals / total raw across window):');
  for (const row of summary.sort((a, b) => b.totalRaw - a.totalRaw)) {
    console.log(`  ${row.id}: ${row.daysWithData}/${DAYS} days, raw=${row.totalRaw}`);
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. Re-run with --write to patch KV history.');
    return;
  }

  const rawHistory = await kv.lrange(HISTORY_KEY, 0, -1);
  const historyList = (Array.isArray(rawHistory) ? rawHistory : [])
    .map(parseHistoryEntry)
    .filter(Boolean);

  const backupDir = join(ROOT, 'scripts', 'backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(
    backupDir,
    `arrivals-history-pre-expansion-backfill-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(backupPath, JSON.stringify(historyList, null, 2));
  console.log(`\nBacked up ${historyList.length} history record(s) to ${backupPath}`);

  const recordsByDate = new Map();
  for (const rec of historyList) {
    const date = calendarDateUtc(rec.saved_at);
    if (!date) continue;
    if (!recordsByDate.has(date)) recordsByDate.set(date, rec);
  }

  let patchedExisting = 0;
  let createdNew = 0;

  for (const win of windows) {
    const dayMetrics = fetchedByDate.get(win.date);
    const rows = [];
    for (const dest of targets) {
      const metrics = dayMetrics.get(dest.id);
      if (!metrics?.ok) continue;
      rows.push(buildPerDestinationRow(metrics, win.saved_at));
    }
    if (!rows.length) continue;

    const existing = recordsByDate.get(win.date);
    if (existing) {
      const perDest = Array.isArray(existing.per_destination) ? [...existing.per_destination] : [];
      const indexById = new Map(perDest.map((row, idx) => [row.id, idx]));
      for (const row of rows) {
        if (indexById.has(row.id)) {
          perDest[indexById.get(row.id)] = row;
        } else {
          perDest.push(row);
        }
      }
      existing.per_destination = perDest;
      existing.expansion_backfill_at = new Date().toISOString();
      patchedExisting += 1;
    } else {
      const totalRaw = rows.reduce((sum, r) => sum + (r.raw_ga_arrivals_24h || 0), 0);
      const newRec = {
        history_version: HISTORY_VERSION,
        saved_at: win.saved_at,
        total_arrivals: totalRaw,
        successful_count: rows.length,
        duration_ms: 0,
        per_destination: rows,
        expansion_backfill: true,
        expansion_backfill_at: new Date().toISOString(),
      };
      historyList.push(newRec);
      recordsByDate.set(win.date, newRec);
      createdNew += 1;
    }
  }

  historyList.sort((a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at));
  const trimmed = historyList.slice(0, 30);

  await kv.del(HISTORY_KEY);
  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    await kv.lpush(HISTORY_KEY, trimmed[i]);
  }
  await kv.ltrim(HISTORY_KEY, 0, 29);

  console.log(`Patched existing day records: ${patchedExisting}`);
  console.log(`Created new day records: ${createdNew}`);
  console.log(`History list size after write: ${trimmed.length}`);
  console.log('Backfill write complete.');
}

main().catch((err) => {
  die(err.stack || err.message);
});
