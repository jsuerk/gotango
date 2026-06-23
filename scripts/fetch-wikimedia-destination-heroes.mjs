#!/usr/bin/env node
/**
 * Fetch Wikimedia Commons hero image candidates for GoTango destination modals.
 *
 * Usage:
 *   node scripts/fetch-wikimedia-destination-heroes.mjs --candidates
 *   node scripts/fetch-wikimedia-destination-heroes.mjs --candidates --specific
 *   node scripts/fetch-wikimedia-destination-heroes.mjs --candidates --only turks-caicos,palm-beach
 *   node scripts/fetch-wikimedia-destination-heroes.mjs --apply-best --only hamptons
 *
 * --candidates writes up to 3 scored options per destination into destination-hero-candidates/
 * without touching the manifest. Use build-hero-review.mjs + apply-hero-selections.mjs to publish.
 */

import { DESTINATIONS } from '../destinations.config.js';
import {
  DESTINATION_HERO_PROFILES,
  GENERIC_WEAK_TOKENS,
  PEOPLE_SUBJECT_KEYWORDS,
  WEAK_SUBJECT_KEYWORDS,
  WIKIMEDIA_DESTINATION_IDS,
} from './destination-hero-profiles.mjs';
import {
  CANDIDATES_DIR,
  MAX_CANDIDATES_PER_DESTINATION,
  WIKIMEDIA_USER_AGENT,
  ensureDirs,
  mergeCandidates,
  publicImageSrc,
  localImagePath,
  downloadImage,
  loadManifest,
  writeManifest,
  writeSelectionReport,
  candidateToManifestEntry,
  hasValidLocalImage,
  stripHtml,
} from './hero-candidate-utils.mjs';

const FORCE = process.argv.includes('--force');
const SPECIFIC = process.argv.includes('--specific');
const CANDIDATES = process.argv.includes('--candidates');
const APPLY_BEST = process.argv.includes('--apply-best');
const INCLUDE_EXISTING_WIKIMEDIA = process.argv.includes('--include-existing-wikimedia');
const ONLY_IDS = parseOnlyArg();
const SEARCH_DELAY_MS = 300;
const MIN_ACCEPT_SCORE = SPECIFIC ? 50 : 20;
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

const ALLOWED_LICENSE_PATTERNS = [
  /^cc by(\s|$|-)/i,
  /^cc by-sa(\s|$|-)/i,
  /^cc0/i,
  /public domain/i,
  /^pd-/i,
];

const FORBIDDEN_LICENSE_PATTERNS = [
  /fair use/i,
  /copyrighted/i,
  /all rights reserved/i,
  /non-free/i,
  /no restrictions/i,
];

const NEGATIVE_KEYWORDS = [
  'person', 'people', 'woman', 'man', 'portrait', 'selfie', 'face', 'model',
  'crowd', 'wedding', 'logo', 'map', 'diagram', 'chart', 'screenshot',
  'airport', 'airplane', 'aircraft', 'interior', 'hotel room', 'restaurant',
];

const POSITIVE_KEYWORDS = [
  'aerial', 'coast', 'coastline', 'beach', 'ocean', 'sea', 'shore',
  'mountain', 'alpine', 'ski', 'snow', 'peak', 'harbor', 'harbour',
  'marina', 'island', 'skyline', 'landscape', 'bay', 'cliff', 'desert',
  'lagoon', 'panorama', 'lighthouse', 'ruins', 'village',
];

function die(message) {
  console.error(message);
  process.exit(1);
}

function parseOnlyArg() {
  const idx = process.argv.indexOf('--only');
  if (idx === -1) return null;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith('--')) die('--only requires a comma-separated destination id list');
  return new Set(val.split(',').map((s) => s.trim()).filter(Boolean));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getProfile(dest) {
  return DESTINATION_HERO_PROFILES[dest.id] || null;
}

function shortDestinationName(name) {
  return name
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*&\s*.+$/, '')
    .replace(/\s*\/\s*.+$/, '')
    .trim();
}

function buildQueries(dest) {
  const name = shortDestinationName(dest.name);
  const profile = getProfile(dest);
  const queries = [];

  if (profile?.iconicQueries?.length) {
    queries.push(...profile.iconicQueries);
  }

  if (SPECIFIC) {
    queries.push(
      `${name} landscape`,
      `${name} coastline`,
      `${name} aerial`,
      `${name} harbor`,
    );
  } else {
    queries.push(
      `${name} landscape`,
      `${name} coast`,
      `${name} aerial`,
      `${dest.region} ${name}`,
    );
  }

  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
}

function imageText(image) {
  return `${image.title || ''} ${image.description || ''} ${image.artist || ''}`.toLowerCase();
}

function hasTokenMatch(text, tokens) {
  return tokens.some((token) => text.includes(token.toLowerCase()));
}

function hasStrongMatch(text, profile, overrideRequired) {
  const required = overrideRequired || profile?.requiredStrong;
  if (!required?.length) return true;
  return hasTokenMatch(text, required);
}

function isOnlyGenericMatch(text, profile) {
  if (hasStrongMatch(text, profile)) return false;
  return hasTokenMatch(text, GENERIC_WEAK_TOKENS);
}

function isLicenseAllowed(license) {
  const value = (license || '').trim();
  if (!value) return false;
  if (FORBIDDEN_LICENSE_PATTERNS.some((re) => re.test(value))) return false;
  return ALLOWED_LICENSE_PATTERNS.some((re) => re.test(value));
}

function isImageAcceptable(image, dest, usedIds, options = {}) {
  if (usedIds.has(image.candidateId)) {
    return { acceptable: false, reason: 'duplicate-id' };
  }

  if (!isLicenseAllowed(image.license)) {
    return { acceptable: false, reason: 'license' };
  }

  const mime = (image.mime || '').toLowerCase();
  if (mime && !mime.startsWith('image/')) {
    return { acceptable: false, reason: 'not-image' };
  }
  if (/svg|gif|tiff|webp/.test(mime)) {
    return { acceptable: false, reason: 'mime-type' };
  }

  const w = image.width || 0;
  const h = image.height || 0;
  if (w > 0 && h > 0) {
    if (w <= h) return { acceptable: false, reason: 'portrait' };
    if (Math.max(w, h) < 1200) return { acceptable: false, reason: 'too-small' };
  }

  const text = imageText(image);
  const profile = getProfile(dest);

  if (hasTokenMatch(text, PEOPLE_SUBJECT_KEYWORDS) || /\b(people|person|crowds?)\b/.test(text)) {
    return { acceptable: false, reason: 'people-subject' };
  }
  if (SPECIFIC && hasTokenMatch(text, WEAK_SUBJECT_KEYWORDS)) {
    return { acceptable: false, reason: 'weak-subject' };
  }
  if (profile?.forbidden?.length && hasTokenMatch(text, profile.forbidden)) {
    return { acceptable: false, reason: 'forbidden-token' };
  }

  const requiredStrong = options.requiredStrong || profile?.requiredStrong;
  if (SPECIFIC && profile) {
    if (!hasStrongMatch(text, profile, requiredStrong)) {
      return { acceptable: false, reason: 'no-strong-match' };
    }
    if (!options.relaxed && isOnlyGenericMatch(text, profile)) {
      return { acceptable: false, reason: 'generic-only' };
    }
    return { acceptable: true };
  }

  if (requiredStrong?.length && !hasStrongMatch(text, profile, requiredStrong)) {
    return { acceptable: false, reason: 'no-strong-match' };
  }

  return { acceptable: true };
}

function scoreImage(image, dest) {
  let score = 0;
  const text = imageText(image);
  const profile = getProfile(dest);
  const w = image.width || 0;
  const h = image.height || 0;

  if (w > 0 && h > 0) {
    if (w > h) score += 20;
    if (Math.max(w, h) >= 2400) score += 14;
    else if (Math.max(w, h) >= 1800) score += 10;
  }

  for (const kw of NEGATIVE_KEYWORDS) {
    if (text.includes(kw)) score -= 24;
  }
  for (const kw of POSITIVE_KEYWORDS) {
    if (text.includes(kw)) score += 6;
  }

  if (profile?.requiredStrong) {
    for (const token of profile.requiredStrong) {
      if (text.includes(token.toLowerCase())) score += SPECIFIC ? 48 : 28;
    }
  }
  if (profile?.iconicBonus) {
    for (const token of profile.iconicBonus) {
      if (text.includes(token.toLowerCase())) score += SPECIFIC ? 40 : 18;
    }
  }

  const name = shortDestinationName(dest.name).toLowerCase();
  if (text.includes(name)) score += 20;
  if (text.includes(dest.id.replace(/-/g, ' '))) score += 15;

  if (SPECIFIC && isOnlyGenericMatch(text, profile)) score -= 90;

  return score;
}

function fileTitleToName(title) {
  return title.replace(/^File:/i, '').replace(/_/g, ' ').replace(/\.[^.]+$/, '');
}

function buildAlt(dest, image) {
  const desc = (image.description || '').trim();
  const titleName = fileTitleToName(image.title || '');
  const profile = getProfile(dest);
  const text = `${desc} ${titleName}`.toLowerCase();
  const bad = /person|people|portrait|logo|map|diagram|screenshot/i.test(text);
  const strong = !profile?.requiredStrong?.length
    || hasTokenMatch(text, profile.requiredStrong)
    || hasTokenMatch(text, profile.iconicBonus || []);

  if (desc.length >= 12 && !bad && strong) return desc.slice(0, 180);
  const name = shortDestinationName(dest.name);
  return `Scenic landscape near ${name}, ${dest.region}`;
}

function defaultObjectPosition(image) {
  const text = imageText(image);
  if (/aerial|skyline|cityscape|mountain|alpine|peak/i.test(text)) return 'center 35%';
  if (/beach|coast|shore|harbor|marina|water/i.test(text)) return 'center 40%';
  return 'center center';
}

function normalizeCommonsImage(page, info) {
  const meta = info.extmetadata || {};
  const title = page.title;
  const description = stripHtml(meta.ImageDescription?.value || meta.ObjectName?.value || '');
  const artist = stripHtml(meta.Artist?.value || meta.Credit?.value || 'Wikimedia contributor');
  const license = stripHtml(meta.LicenseShortName?.value || meta.UsageTerms?.value || '');
  const width = info.width || info.thumbwidth || 0;
  const height = info.height || info.thumbheight || 0;
  const downloadUrl = info.thumburl || info.url;
  const sourceUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`;

  return {
    candidateId: `wikimedia-${page.pageid}`,
    source: 'Wikimedia Commons',
    previewUrl: info.thumburl || info.url,
    downloadUrl,
    thumbnailUrl: info.thumburl || info.url,
    alt: description || fileTitleToName(title),
    credit: artist || 'Wikimedia Commons',
    sourceUrl,
    license: license || 'See Wikimedia Commons file page',
    width,
    height,
    mime: info.mime || '',
    wikimediaFile: title.replace(/^File:/i, ''),
    title,
    description,
    artist,
    pageId: page.pageid,
    objectPosition: defaultObjectPosition({ title, description, artist }),
  };
}

async function searchCommons(query) {
  const url = new URL(COMMONS_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', query);
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', '25');
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|size|extmetadata|mime|thumbmime');
  url.searchParams.set('iiurlwidth', '1800');
  url.searchParams.set('iiextmetadatafilter', 'ImageDescription|Artist|Credit|LicenseShortName|UsageTerms|ObjectName');

  const res = await fetch(url, {
    headers: { 'User-Agent': WIKIMEDIA_USER_AGENT },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Commons search failed (${res.status}) for "${query}": ${body}`);
  }

  const data = await res.json();
  const pages = data.query?.pages;
  if (!pages) return [];

  return Object.values(pages)
    .filter((page) => page.imageinfo?.[0])
    .map((page) => normalizeCommonsImage(page, page.imageinfo[0]));
}

function rankImages(images, dest, usedIds, options = {}) {
  const minScore = options.minScore ?? MIN_ACCEPT_SCORE;
  return images
    .map((image) => {
      const acceptance = isImageAcceptable(image, dest, usedIds, options);
      if (!acceptance.acceptable) return null;
      return {
        ...image,
        score: scoreImage(image, dest),
        notes: acceptance.reason || '',
      };
    })
    .filter(Boolean)
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

async function findTopCandidates(dest, usedIds, limit = MAX_CANDIDATES_PER_DESTINATION) {
  const collected = new Map();
  const queries = buildQueries(dest);

  for (const query of queries) {
    const images = await searchCommons(query);
    await sleep(SEARCH_DELAY_MS);
    const ranked = rankImages(images, dest, usedIds);
    for (const item of ranked) {
      if (!collected.has(item.candidateId)) {
        collected.set(item.candidateId, { ...item, queryUsed: query });
      }
    }
    if (collected.size >= limit) break;
  }

  const profile = getProfile(dest);
  if (collected.size < limit && profile?.relaxedFallback) {
    const { queries: relaxedQueries, requiredStrong, minScore } = profile.relaxedFallback;
    for (const query of relaxedQueries) {
      const images = await searchCommons(query);
      await sleep(SEARCH_DELAY_MS);
      const ranked = rankImages(images, dest, usedIds, { requiredStrong, minScore, relaxed: true });
      for (const item of ranked) {
        if (!collected.has(item.candidateId)) {
          collected.set(item.candidateId, { ...item, queryUsed: query, notes: 'relaxed-fallback' });
        }
      }
      if (collected.size >= limit) break;
    }
  }

  return [...collected.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function resolveTargetDestinations() {
  let list = DESTINATIONS;
  if (ONLY_IDS) {
    const unknown = [...ONLY_IDS].filter((id) => !DESTINATIONS.some((d) => d.id === id));
    if (unknown.length) die(`Unknown destination id(s) in --only: ${unknown.join(', ')}`);
    list = DESTINATIONS.filter((d) => ONLY_IDS.has(d.id));
  } else if (!INCLUDE_EXISTING_WIKIMEDIA) {
    list = DESTINATIONS.filter((d) => !WIKIMEDIA_DESTINATION_IDS.has(d.id));
  }
  return list;
}

async function runCandidatesMode(targets) {
  ensureDirs();
  const usedIds = new Set();
  let updated = 0;
  let empty = 0;

  console.log(`Wikimedia candidate fetch (${SPECIFIC ? 'specific' : 'standard'}, ${targets.length} destinations)`);
  console.log(`Writing to ${CANDIDATES_DIR}/`);

  for (const dest of targets) {
    console.log(`Search ${dest.id} (${dest.name})...`);
    let candidates;
    try {
      candidates = await findTopCandidates(dest, usedIds);
    } catch (err) {
      die(`Stopped on ${dest.id}: ${err.message}`);
    }

    if (!candidates.length) {
      empty += 1;
      console.log(`  No suitable Commons results for ${dest.id}`);
      continue;
    }

    for (const c of candidates) usedIds.add(c.candidateId);
    const bundle = mergeCandidates(dest.id, dest.name, candidates, 'Wikimedia Commons');
    updated += 1;
    console.log(
      `  Saved ${bundle.candidates.length} candidate(s) for ${dest.id} `
      + `(top score ${candidates[0].score}, query "${candidates[0].queryUsed}")`,
    );
    await sleep(SEARCH_DELAY_MS);
  }

  console.log('\nDone.');
  console.log(`Destinations with candidates: ${updated}`);
  console.log(`Destinations with no results: ${empty}`);
  console.log('Next: node scripts/build-hero-review.mjs');
}

async function runApplyBestMode(targets) {
  ensureDirs();
  const manifest = loadManifest();
  const applied = [];
  const missing = [];

  for (const dest of targets) {
    const existing = manifest[dest.id];
    if (!FORCE && existing && hasValidLocalImage(existing)) {
      console.log(`Skip ${dest.id} (existing local image)`);
      continue;
    }

    console.log(`Search ${dest.id} (${dest.name})...`);
    const usedIds = new Set();
    const candidates = await findTopCandidates(dest, usedIds, 1);
    if (!candidates.length) {
      missing.push(dest.id);
      console.log(`  No suitable Commons result for ${dest.id}`);
      continue;
    }

    const best = candidates[0];
    const outPath = localImagePath(dest.id);
    await downloadImage(best.downloadUrl, outPath);

    const entry = candidateToManifestEntry(dest.id, {
      ...best,
      alt: buildAlt(dest, best),
      objectPosition: best.objectPosition || defaultObjectPosition(best),
      reviewed: true,
    });
    manifest[dest.id] = entry;
    applied.push(dest.id);
    console.log(`  Applied ${dest.id} (${best.wikimediaFile}, score ${best.score})`);
    await sleep(SEARCH_DELAY_MS);
  }

  writeManifest(manifest);
  writeSelectionReport(manifest);
  console.log('\nDone.');
  console.log(`Applied: ${applied.length}${applied.length ? ` (${applied.join(', ')})` : ''}`);
  console.log(`Missing: ${missing.length}${missing.length ? ` (${missing.join(', ')})` : ''}`);
}

async function main() {
  if (!CANDIDATES && !APPLY_BEST) {
    die(
      'Specify --candidates (review workflow) or --apply-best (direct manifest update).\n'
      + 'Examples:\n'
      + '  node scripts/fetch-wikimedia-destination-heroes.mjs --candidates --specific --only turks-caicos\n'
      + '  node scripts/fetch-wikimedia-destination-heroes.mjs --apply-best --only hamptons --force',
    );
  }

  const targets = resolveTargetDestinations();
  if (CANDIDATES) await runCandidatesMode(targets);
  else await runApplyBestMode(targets);
}

main().catch((err) => {
  die(`Unexpected error: ${err.stack || err.message}`);
});
