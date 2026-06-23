#!/usr/bin/env node
/**
 * Fetch Pexels landscape hero images for GoTango destination modals.
 *
 * Usage:
 *   PEXELS_API_KEY=... node scripts/fetch-pexels-destination-heroes.mjs
 *   PEXELS_API_KEY=... node scripts/fetch-pexels-destination-heroes.mjs --force
 *   PEXELS_API_KEY=... node scripts/fetch-pexels-destination-heroes.mjs --force --only turks-caicos,nantucket
 *   PEXELS_API_KEY=... node scripts/fetch-pexels-destination-heroes.mjs --force --specific
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { DESTINATIONS } from '../destinations.config.js';
import {
  DESTINATION_HERO_PROFILES,
  GENERIC_WEAK_TOKENS,
  PEOPLE_SUBJECT_KEYWORDS,
  WEAK_SUBJECT_KEYWORDS,
  WIKIMEDIA_DESTINATION_IDS,
} from './destination-hero-profiles.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IMAGES_DIR = join(ROOT, 'images', 'destinations');
const MANIFEST_PATH = join(ROOT, 'destination-images.config.js');
const REPORT_PATH = join(ROOT, 'destination-image-selections.md');

const FORCE = process.argv.includes('--force');
const SPECIFIC = process.argv.includes('--specific');
const ONLY_IDS = parseOnlyArg();
const API_KEY = loadApiKey();
const SEARCH_DELAY_MS = 250;
const MIN_ACCEPT_SCORE = SPECIFIC ? 55 : 25;
const MAX_EDGE_PX = 1800;

const BEACH_ISLAND_IDS = new Set([
  'st-barts', 'turks-caicos', 'anguilla', 'mustique', 'harbour-island',
  'barbados', 'antigua', 'nassau', 'exuma', 'block-island', 'nantucket',
  'marthas-vineyard', 'palm-beach', 'tulum', 'cabo-san-lucas', 'comporta',
  'capri-naples', 'amalfi-salerno', 'mallorca', 'sicily-catania', 'santorini',
  'mykonos', 'ibiza', 'st-tropez', 'sardinia-olbia', 'phuket', 'maldives',
  'bali', 'koh-samui', 'punta-del-este', 'puerto-vallarta', 'puerto-escondido',
  'destin-30a', 'cape-cod', 'hamptons', 'hilton-head', 'coronado-san-diego',
  'casa-de-campo',
]);

const MOUNTAIN_SKI_IDS = new Set([
  'aspen', 'courchevel', 'st-moritz', 'jackson-hole', 'verbier',
  'megeve-chamonix', 'whistler', 'sun-valley',
]);

const DESERT_IDS = new Set(['santa-fe', 'marrakech']);

const CITY_IDS = new Set(['charleston', 'dubai-private', 'marrakech', 'napa']);

const NEGATIVE_KEYWORDS = [
  'person', 'people', 'woman', 'man', 'men', 'women', 'couple', 'wedding',
  'portrait', 'selfie', 'face', 'model', 'crowd', 'tourist posing',
  'hotel room', 'bedroom', 'bathroom', 'interior', 'kitchen', 'lobby',
  'food', 'restaurant', 'dish', 'meal', 'logo', 'signage', 'sign ',
  'brand', 'business meeting', 'office', 'laptop', 'stock photo',
  'private home', 'suburb', 'backyard', 'driveway', 'beach ball',
  'ripped', 'ruins', 'airplane', 'aircraft', 'airport',
];

const HOTEL_RESORT_KEYWORDS = [
  'hotel', 'resort', 'motel', 'inn ', 'pier house', 'casa demae',
  'villa rental', 'airbnb', 'hostel', 'accommodation',
];

const POSITIVE_KEYWORDS = [
  'aerial', 'drone', 'coast', 'coastline', 'beach', 'ocean', 'sea', 'shore',
  'mountain', 'alpine', 'ski', 'snow', 'peak', 'summit', 'valley',
  'harbor', 'harbour', 'marina', 'port', 'island', 'archipelago',
  'skyline', 'cityscape', 'landscape', 'bay', 'cliff', 'canyon', 'desert',
  'dune', 'village', 'old town', 'waterfront', 'lagoon', 'atoll', 'reef',
  'vineyard', 'countryside', 'panorama',
];

const REGION_COUNTRY_HINTS = {
  Caribbean: 'Caribbean',
  'French Caribbean': 'Caribbean',
  'British Caribbean': 'Caribbean',
  Bahamas: 'Bahamas',
  'Greek Islands': 'Greece',
  'Balearic Islands': 'Spain',
  "Côte d'Azur": 'France Mediterranean',
  Sardinia: 'Sardinia Italy',
  'Colorado Rockies': 'Colorado',
  'French Alps': 'French Alps',
  'Swiss Alps': 'Swiss Alps',
  Wyoming: 'Wyoming',
  'New York': 'Long Island',
  Massachusetts: 'Massachusetts coast',
  Florida: 'Florida coast',
  'Riviera Maya': 'Mexico Caribbean coast',
  'Baja California Sur': 'Baja California',
  Portugal: 'Portugal coast',
  'Campania, Italy': 'Amalfi Coast Italy',
  'Sicily, Italy': 'Sicily Italy',
  'British Columbia': 'British Columbia mountains',
  'Rhode Island': 'Rhode Island coast',
  'South Carolina': 'South Carolina coast',
  Idaho: 'Idaho mountains',
  California: 'California coast',
  'New Mexico': 'New Mexico desert',
  'Florida Panhandle': 'Florida Gulf coast',
  'Riviera Nayarit, Mexico': 'Nayarit Mexico coast',
  'Oaxaca, Mexico': 'Oaxaca Mexico coast',
  Thailand: 'Thailand islands',
  Maldives: 'Maldives',
  Indonesia: 'Bali Indonesia',
  'United Arab Emirates': 'Dubai skyline',
  Uruguay: 'Uruguay coast',
  Morocco: 'Morocco',
  'Dominican Republic': 'Dominican Republic coast',
};

function getProfile(dest) {
  return DESTINATION_HERO_PROFILES[dest.id] || null;
}

function loadApiKey() {
  if (process.env.PEXELS_API_KEY?.trim()) {
    return process.env.PEXELS_API_KEY.trim();
  }
  const envLocalPath = join(ROOT, '.env.local');
  if (!existsSync(envLocalPath)) return null;
  const lines = readFileSync(envLocalPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^PEXELS_API_KEY\s*=\s*(.+)$/);
    if (!match) continue;
    return match[1].trim().replace(/^['"]|['"]$/g, '');
  }
  return null;
}

function parseOnlyArg() {
  const idx = process.argv.indexOf('--only');
  if (idx === -1) return null;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith('--')) {
    die('--only requires a comma-separated destination id list');
  }
  return new Set(val.split(',').map((s) => s.trim()).filter(Boolean));
}

function die(message) {
  console.error(message);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function manifestKey(id) {
  // Hyphenated ids (e.g. st-barts) must be quoted for valid JS object literals.
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(id) ? id : jsString(id);
}

function quoteManifestObjectKeys(objectLiteral) {
  return objectLiteral.replace(
    /^(\s*)([a-zA-Z_$][\w-]*)(\s*:)/gm,
    (full, indent, key, colon) => {
      if (key.includes('-')) return `${indent}${JSON.stringify(key)}${colon}`;
      return full;
    },
  );
}

function loadManifest() {
  const content = readFileSync(MANIFEST_PATH, 'utf8');
  const match = content.match(/window\.DESTINATION_IMAGE_MANIFEST\s*=\s*(\{[\s\S]*\});/);
  if (!match) die(`Could not parse ${MANIFEST_PATH}`);
  const normalized = quoteManifestObjectKeys(match[1]);
  return Function(`return ${normalized}`)();
}

function shortDestinationName(name) {
  return name
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*&\s*.+$/, '')
    .replace(/\s*\/\s*.+$/, '')
    .trim();
}

function getTypeHints(dest) {
  const hints = new Set();
  if (BEACH_ISLAND_IDS.has(dest.id)) {
    hints.add('beach');
    hints.add('island');
  }
  if (MOUNTAIN_SKI_IDS.has(dest.id)) hints.add('mountain');
  if (DESERT_IDS.has(dest.id)) hints.add('desert');
  if (CITY_IDS.has(dest.id)) hints.add('city');
  if ((dest.season || []).includes('winter') && !BEACH_ISLAND_IDS.has(dest.id)) {
    hints.add('mountain');
  }
  if (/island|coast|beach|harbour|harbor|cape|vineyard/i.test(dest.name)) {
    hints.add('beach');
  }
  return [...hints];
}

function getRelevanceTokens(dest) {
  const tokens = new Set();
  const add = (value) => {
    if (!value) return;
    value
      .toLowerCase()
      .replace(/[.'’]/g, '')
      .split(/[\s,&/()-]+/)
      .filter((t) => t.length >= 3)
      .forEach((t) => tokens.add(t));
  };
  add(dest.id.replace(/-/g, ' '));
  add(shortDestinationName(dest.name));
  add(dest.region);
  const regionHint = REGION_COUNTRY_HINTS[dest.region];
  if (regionHint) add(regionHint);
  const profile = getProfile(dest);
  if (profile?.requiredStrong) profile.requiredStrong.forEach((t) => add(t));
  if (profile?.iconicBonus) profile.iconicBonus.forEach((t) => add(t));
  return [...tokens];
}

function buildQueries(dest) {
  const name = shortDestinationName(dest.name);
  const regionHint = REGION_COUNTRY_HINTS[dest.region] || dest.region;
  const hints = getTypeHints(dest);
  const profile = getProfile(dest);
  const queries = [];

  const push = (...items) => {
    for (const q of items) {
      const trimmed = q.trim();
      if (trimmed) queries.push(trimmed);
    }
  };

  if (profile?.iconicQueries?.length) {
    push(...profile.iconicQueries);
  }

  if (SPECIFIC) {
    push(
      `${name} landmark`,
      `${name} famous view`,
      `${name} iconic`,
      `${name} skyline`,
      `${name} harbor`,
      `${name} coastline`,
    );
    return [...new Set(queries)];
  }

  push(
    `${name} aerial`,
    `${name} coastline`,
    `${name} beach`,
    `${name} landscape`,
    `${name} mountains`,
    `${name} harbor`,
    `${name} cityscape`,
  );

  if (hints.includes('beach') || hints.includes('island')) {
    push(
      `${name} coastline`,
      `${name} beach aerial`,
      `${name} island aerial`,
      `${name} marina`,
    );
  }
  if (hints.includes('mountain')) {
    push(
      `${name} mountains`,
      `${name} ski village`,
      `${name} alpine landscape`,
      `${regionHint} mountain landscape`,
    );
  }
  if (hints.includes('desert')) {
    push(
      `${name} desert landscape`,
      `${name} canyon`,
      `${regionHint} desert`,
    );
  }
  if (hints.includes('city')) {
    push(
      `${name} skyline`,
      `${name} old town`,
      `${name} waterfront`,
      `${name} cityscape`,
    );
  }

  push(
    `${regionHint} coast`,
    `${regionHint} beach aerial`,
    `${regionHint} landscape`,
    `${regionHint} aerial`,
  );

  return [...new Set(queries)];
}

function photoText(photo) {
  return `${photo.alt || ''} ${photo.url || ''}`.toLowerCase();
}

function hasTokenMatch(text, tokens) {
  return tokens.some((token) => text.includes(token.toLowerCase()));
}

function hasStrongMatch(text, profile, overrideRequired) {
  const required = overrideRequired || profile?.requiredStrong;
  if (!required?.length) return true;
  return hasTokenMatch(text, required);
}

function hasPeopleSubject(text) {
  return hasTokenMatch(text, PEOPLE_SUBJECT_KEYWORDS)
    || /\b(people|person|persons|crowds?)\b/.test(text);
}

function hasWeakSubject(text, dest) {
  if (hasTokenMatch(text, WEAK_SUBJECT_KEYWORDS)) return true;
  if (dest.id === 'jackson-hole' && /wooden building|barn/.test(text) && !/teton/.test(text)) {
    return true;
  }
  if (dest.id === 'puerto-vallarta' && /blue sea under/.test(text)) return true;
  if (dest.id === 'mallorca' && /photo of the ocean/.test(text)) return true;
  return false;
}

function isOnlyGenericMatch(text, profile) {
  if (hasStrongMatch(text, profile)) return false;
  return hasTokenMatch(text, GENERIC_WEAK_TOKENS);
}

function isPhotoAcceptable(photo, dest, usedPhotoIds, options = {}) {
  if (usedPhotoIds.has(photo.id)) {
    return { acceptable: false, reason: 'duplicate-photo-id' };
  }

  const text = photoText(photo);
  const profile = getProfile(dest);
  const requiredStrong = options.requiredStrong || profile?.requiredStrong;

  if (hasPeopleSubject(text)) {
    return { acceptable: false, reason: 'people-subject' };
  }

  if (SPECIFIC && hasWeakSubject(text, dest)) {
    return { acceptable: false, reason: 'weak-subject' };
  }

  for (const kw of HOTEL_RESORT_KEYWORDS) {
    if (text.includes(kw)) {
      return { acceptable: false, reason: `hotel-resort:${kw}` };
    }
  }

  if (profile?.forbidden?.length && hasTokenMatch(text, profile.forbidden)) {
    return { acceptable: false, reason: 'forbidden-token' };
  }

  if (SPECIFIC && profile) {
    if (!hasStrongMatch(text, profile, requiredStrong)) {
      return { acceptable: false, reason: 'no-strong-destination-match' };
    }
    if (!options.relaxed && isOnlyGenericMatch(text, profile)) {
      return { acceptable: false, reason: 'generic-only-match' };
    }
    return { acceptable: true };
  }

  const required = requiredStrong || [];
  const relevanceTokens = getRelevanceTokens(dest).filter((t) => t.length >= 4);
  const matchPool = [...new Set([...required, ...relevanceTokens])];

  if (matchPool.length && !hasTokenMatch(text, matchPool)) {
    return { acceptable: false, reason: 'no-relevance-match' };
  }

  return { acceptable: true };
}

function scorePhoto(photo, dest) {
  let score = 0;
  const text = photoText(photo);
  const w = photo.width || 0;
  const h = photo.height || 0;
  const profile = getProfile(dest);

  if (w > 0 && h > 0) {
    if (w > h) score += 22;
    else score -= 25;
    if (Math.max(w, h) >= 2000) score += 12;
    else if (Math.max(w, h) >= 1400) score += 8;
    if (Math.min(w, h) >= 900) score += 5;
  }

  for (const kw of NEGATIVE_KEYWORDS) {
    if (text.includes(kw)) score -= 28;
  }
  for (const kw of POSITIVE_KEYWORDS) {
    if (text.includes(kw)) score += 7;
  }

  if (profile?.requiredStrong) {
    for (const token of profile.requiredStrong) {
      if (text.includes(token.toLowerCase())) score += SPECIFIC ? 50 : 30;
    }
  }
  if (profile?.iconicBonus) {
    for (const token of profile.iconicBonus) {
      if (text.includes(token.toLowerCase())) score += SPECIFIC ? 45 : 20;
    }
  }

  for (const token of getRelevanceTokens(dest)) {
    if (text.includes(token.toLowerCase())) score += 15;
  }

  if (SPECIFIC && isOnlyGenericMatch(text, profile)) {
    score -= 100;
  }

  return score;
}

function pickBestPhoto(photos, dest, usedPhotoIds, options = {}) {
  const minScore = options.minScore ?? MIN_ACCEPT_SCORE;
  const ranked = photos
    .map((photo) => {
      const acceptance = isPhotoAcceptable(photo, dest, usedPhotoIds, options);
      if (!acceptance.acceptable) return null;
      return { photo, score: scorePhoto(photo, dest), acceptance };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length || ranked[0].score < minScore) return null;
  return ranked[0];
}

function collectUsedPhotoIds(manifest, excludeIds) {
  const used = new Set();
  for (const [id, entry] of Object.entries(manifest)) {
    if (excludeIds?.has(id)) continue;
    if (entry?.pexelsPhotoId != null) used.add(entry.pexelsPhotoId);
  }
  return used;
}

async function searchPexels(query) {
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('per_page', '20');

  const res = await fetch(url, {
    headers: { Authorization: API_KEY },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pexels search failed (${res.status}) for "${query}": ${body}`);
  }

  const data = await res.json();
  return data.photos || [];
}

function getDownloadUrl(photo) {
  return photo.src?.large2x || photo.src?.large || photo.src?.original || null;
}

function localImagePath(destId) {
  return join(IMAGES_DIR, `${destId}-hero.jpg`);
}

function publicImageSrc(destId) {
  return `/images/destinations/${destId}-hero.jpg`;
}

function hasValidLocalImage(entry) {
  if (!entry?.src || typeof entry.src !== 'string') return false;
  const rel = entry.src.replace(/^\//, '');
  const full = join(ROOT, rel);
  return existsSync(full) && statSync(full).size > 0;
}

function resizeImage(filePath) {
  try {
    execSync(`sips -Z ${MAX_EDGE_PX} "${filePath}" --out "${filePath}"`, {
      stdio: 'pipe',
    });
  } catch (err) {
    console.warn(`  Warning: sips resize failed for ${filePath}: ${err.message}`);
  }
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}) from ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  resizeImage(destPath);
}

function buildAlt(dest, photo) {
  const pexelsAlt = (photo.alt || '').trim();
  const text = pexelsAlt.toLowerCase();
  const profile = getProfile(dest);
  const badAlt = /person|people|portrait|hotel|resort|beach ball|ripped|airport|airplane|monument|plaque|engraving|kids|children|couple|crowd|jetski|jet ski|footprints on|cell tower|open field/i.test(text);
  const strongTokens = profile?.requiredStrong || [];
  const relevant = !strongTokens.length
    || hasTokenMatch(text, strongTokens)
    || hasTokenMatch(text, profile?.iconicBonus || []);

  if (pexelsAlt.length >= 12 && !badAlt && relevant) {
    return pexelsAlt;
  }
  const name = shortDestinationName(dest.name);
  const region = dest.region ? `, ${dest.region}` : '';
  return `Scenic landscape near ${name}${region}`;
}

function defaultObjectPosition(dest, photo) {
  const text = photoText(photo);
  if (/aerial|skyline|cityscape|mountain|alpine|peak/i.test(text)) {
    return 'center 35%';
  }
  if (/beach|coast|shore|harbor|marina|water/i.test(text)) {
    return 'center 40%';
  }
  return 'center center';
}

function jsString(value) {
  return JSON.stringify(value);
}

function formatManifestEntry(id, entry) {
  const key = manifestKey(id);
  const lines = [
    `  ${key}: {`,
    `    src: ${jsString(entry.src)},`,
    `    alt: ${jsString(entry.alt)},`,
    `    credit: ${jsString(entry.credit)},`,
    `    sourceUrl: ${jsString(entry.sourceUrl)},`,
  ];
  if (entry.photographer) lines.push(`    photographer: ${jsString(entry.photographer)},`);
  if (entry.photographerUrl) lines.push(`    photographerUrl: ${jsString(entry.photographerUrl)},`);
  lines.push(`    license: ${jsString(entry.license)},`);
  if (entry.source) lines.push(`    source: ${jsString(entry.source)},`);
  lines.push(`    objectPosition: ${jsString(entry.objectPosition)},`);
  if (entry.queryUsed) lines.push(`    queryUsed: ${jsString(entry.queryUsed)},`);
  if (entry.pexelsPhotoId != null) lines.push(`    pexelsPhotoId: ${entry.pexelsPhotoId},`);
  if (entry.reviewed === false) lines.push('    reviewed: false,');
  lines.push('  },');
  return lines.join('\n');
}

function writeManifest(manifest, destinations) {
  const orderedIds = destinations.map((d) => d.id);
  const extraIds = Object.keys(manifest).filter((id) => !orderedIds.includes(id));
  const ids = [...orderedIds, ...extraIds];

  const body = ids
    .filter((id) => manifest[id])
    .map((id) => formatManifestEntry(id, manifest[id]))
    .join('\n');

  const content = `/**
 * Destination modal photo hero manifest (prototype).
 * Keyed by destination id — same ids used in destinations.config.js and the modal.
 * Missing entries or failed image loads fall back to the dark editorial header.
 */
window.DESTINATION_IMAGE_MANIFEST = {
${body}
};
`;
  writeFileSync(MANIFEST_PATH, content, 'utf8');
}

function escapeTableCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function writeReport(destinations, manifest, reportRows) {
  const rowById = new Map(reportRows.map((r) => [r.id, r]));
  const rows = destinations.map((dest) => {
    const existing = rowById.get(dest.id);
    if (existing) return existing;
    const entry = manifest[dest.id];
    if (!entry) {
      return {
        id: dest.id,
        name: dest.name,
        localPath: '—',
        queryUsed: '—',
        pexelsUrl: '—',
        photographer: '—',
        photographerUrl: '—',
        notes: 'No image selected',
        reviewed: 'false',
      };
    }
    return {
      id: dest.id,
      name: dest.name,
      localPath: entry.src || '—',
      queryUsed: entry.queryUsed || '—',
      pexelsUrl: entry.sourceUrl || '—',
      photographer: entry.photographer || entry.credit || '—',
      photographerUrl: entry.photographerUrl || '—',
      notes: entry.source === 'Pexels' ? 'Pexels automated selection' : (entry.source || entry.credit || 'Existing entry'),
      reviewed: entry.reviewed === false ? 'false' : 'true',
    };
  });

  const lines = [
    '# Destination image selections',
    '',
    'Automated Pexels hero image selections for GoTango destination modals.',
    'Review each row before treating images as production-ready.',
    '',
    '| Destination ID | Destination Name | Local Image Path | Query Used | Pexels Photo URL | Photographer | Photographer URL | Notes | Reviewed |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const row of rows) {
    lines.push(
      `| ${escapeTableCell(row.id)} | ${escapeTableCell(row.name)} | ${escapeTableCell(row.localPath)} | ${escapeTableCell(row.queryUsed)} | ${escapeTableCell(row.pexelsUrl)} | ${escapeTableCell(row.photographer)} | ${escapeTableCell(row.photographerUrl)} | ${escapeTableCell(row.notes)} | ${escapeTableCell(row.reviewed)} |`,
    );
  }

  lines.push('');
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

async function findPhotoForDestination(dest, usedPhotoIds) {
  const queries = buildQueries(dest);
  for (const query of queries) {
    const photos = await searchPexels(query);
    await sleep(SEARCH_DELAY_MS);
    const pick = pickBestPhoto(photos, dest, usedPhotoIds);
    if (pick) {
      return { photo: pick.photo, score: pick.score, query, pass: 'specific' };
    }
  }

  const profile = getProfile(dest);
  if (profile?.relaxedFallback) {
    const { queries: relaxedQueries, requiredStrong, minScore } = profile.relaxedFallback;
    for (const query of relaxedQueries) {
      const photos = await searchPexels(query);
      await sleep(SEARCH_DELAY_MS);
      const pick = pickBestPhoto(photos, dest, usedPhotoIds, {
        requiredStrong,
        minScore,
        relaxed: true,
      });
      if (pick) {
        return { photo: pick.photo, score: pick.score, query, pass: 'relaxed-fallback' };
      }
    }
  }

  return null;
}

function resolveTargetDestinations() {
  let list = DESTINATIONS;
  if (ONLY_IDS) {
    const unknown = [...ONLY_IDS].filter((id) => !DESTINATIONS.some((d) => d.id === id));
    if (unknown.length) {
      die(`Unknown destination id(s) in --only: ${unknown.join(', ')}`);
    }
    list = DESTINATIONS.filter((d) => ONLY_IDS.has(d.id));
  } else if (SPECIFIC) {
    list = DESTINATIONS.filter((d) => !WIKIMEDIA_DESTINATION_IDS.has(d.id));
  }
  return list;
}

async function main() {
  if (!API_KEY) {
    die(
      'Missing PEXELS_API_KEY.\n' +
      'Set it in your environment, or add PEXELS_API_KEY=... to .env.local (not committed), then rerun:\n' +
      '  PEXELS_API_KEY=your_key node scripts/fetch-pexels-destination-heroes.mjs',
    );
  }

  mkdirSync(IMAGES_DIR, { recursive: true });
  const manifest = loadManifest();
  const targets = resolveTargetDestinations();
  const refetchIds = new Set(targets.map((d) => d.id));
  const usedPhotoIds = collectUsedPhotoIds(manifest, ONLY_IDS ? refetchIds : null);

  const reportRows = [];
  const skipped = [];
  const missing = [];
  const downloaded = [];
  const added = [];

  const mode = SPECIFIC
    ? (ONLY_IDS ? `specific, only ${targets.length}` : 'specific, all Pexels destinations')
    : (ONLY_IDS ? `only ${targets.length} destination(s)` : (FORCE ? 'force all' : 'skip existing'));
  console.log(`GoTango destination hero fetch (${mode})`);
  console.log(`Reserved photo IDs from kept entries: ${usedPhotoIds.size}`);

  for (const dest of targets) {
    const existing = manifest[dest.id];
    const shouldFetch = FORCE || ONLY_IDS || !existing || !hasValidLocalImage(existing);
    if (!shouldFetch) {
      skipped.push(dest.id);
      console.log(`Skip ${dest.id} (existing local image)`);
      continue;
    }

    console.log(`Search ${dest.id} (${dest.name})...`);
    let result;
    try {
      result = await findPhotoForDestination(dest, usedPhotoIds);
    } catch (err) {
      die(`Stopped on ${dest.id}: ${err.message}`);
    }

    if (!result) {
      missing.push(dest.id);
      console.log(`  No suitable Pexels result for ${dest.id}`);
      continue;
    }

    const { photo, score, query, pass } = result;
    const downloadUrl = getDownloadUrl(photo);
    if (!downloadUrl) {
      missing.push(dest.id);
      console.log(`  No downloadable URL for ${dest.id}`);
      continue;
    }

    const outPath = localImagePath(dest.id);
    try {
      await downloadImage(downloadUrl, outPath);
    } catch (err) {
      die(`Stopped downloading ${dest.id}: ${err.message}`);
    }

    const photographer = photo.photographer || 'Pexels Contributor';
    const photographerUrl = photo.photographer_url || 'https://www.pexels.com';
    const sourceUrl = photo.url || `https://www.pexels.com/photo/${photo.id}/`;

    manifest[dest.id] = {
      src: publicImageSrc(dest.id),
      alt: buildAlt(dest, photo),
      credit: photographer,
      sourceUrl,
      photographer,
      photographerUrl,
      license: 'Pexels License',
      source: 'Pexels',
      objectPosition: defaultObjectPosition(dest, photo),
      queryUsed: query,
      pexelsPhotoId: photo.id,
      reviewed: false,
    };

    usedPhotoIds.add(photo.id);
    downloaded.push(dest.id);
    added.push(dest.id);

    reportRows.push({
      id: dest.id,
      name: dest.name,
      localPath: manifest[dest.id].src,
      queryUsed: query,
      pexelsUrl: sourceUrl,
      photographer,
      photographerUrl,
      notes: `score=${score}; ${pass || (SPECIFIC ? 'specific pass' : 'refetch pass')}`,
      reviewed: 'false',
    });

    console.log(`  Saved ${dest.id} (photo ${photo.id}, score ${score}, query "${query}")`);
    await sleep(SEARCH_DELAY_MS);
  }

  writeManifest(manifest, DESTINATIONS);
  writeReport(DESTINATIONS, manifest, reportRows);

  console.log('\nDone.');
  console.log(`Images downloaded: ${downloaded.length}`);
  console.log(`Manifest entries added/updated: ${added.length}`);
  console.log(`Skipped: ${skipped.length}${skipped.length ? ` (${skipped.join(', ')})` : ''}`);
  console.log(`Missing / no good result: ${missing.length}${missing.length ? ` (${missing.join(', ')})` : ''}`);
  console.log(`Updated: ${MANIFEST_PATH}`);
  console.log(`Updated: ${REPORT_PATH}`);
  if (downloaded.length) {
    console.log(`Images: ${downloaded.map((id) => publicImageSrc(id)).join(', ')}`);
  }
}

main().catch((err) => {
  die(`Unexpected error: ${err.stack || err.message}`);
});
