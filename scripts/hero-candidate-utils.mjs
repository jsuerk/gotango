/**
 * Shared helpers for destination hero candidate fetch + review workflow.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { DESTINATIONS } from '../destinations.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');
export const IMAGES_DIR = join(ROOT, 'images', 'destinations');
export const CANDIDATES_DIR = join(ROOT, 'destination-hero-candidates');
export const MANIFEST_PATH = join(ROOT, 'destination-images.config.js');
export const REPORT_PATH = join(ROOT, 'destination-image-selections.md');
export const APPROVED_PATH = join(ROOT, 'destination-hero-selections-approved.json');
export const REVIEW_HTML_PATH = join(ROOT, 'destination-hero-review.html');

export const MAX_CANDIDATES_PER_DESTINATION = 3;
export const MAX_EDGE_PX = 1800;
export const WIKIMEDIA_USER_AGENT = 'GoTangoDestinationHero/1.0 (local curation; contact: dev@gotango.app)';

export function ensureDirs() {
  mkdirSync(IMAGES_DIR, { recursive: true });
  mkdirSync(CANDIDATES_DIR, { recursive: true });
}

export function candidateFilePath(destinationId) {
  return join(CANDIDATES_DIR, `${destinationId}.json`);
}

export function readCandidateBundle(destinationId) {
  const path = candidateFilePath(destinationId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeCandidateBundle(bundle) {
  const path = candidateFilePath(bundle.destinationId);
  writeFileSync(path, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
}

export function readAllCandidateBundles() {
  if (!existsSync(CANDIDATES_DIR)) return [];
  return readdirSync(CANDIDATES_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(CANDIDATES_DIR, name), 'utf8')))
    .sort((a, b) => a.destinationName.localeCompare(b.destinationName));
}

/**
 * Merge new candidates from one source into a destination bundle, keeping top N by score.
 */
export function mergeCandidates(destinationId, destinationName, incoming, source) {
  const existing = readCandidateBundle(destinationId);
  const kept = (existing?.candidates || []).filter((c) => c.source !== source);
  const merged = [...kept, ...incoming]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, MAX_CANDIDATES_PER_DESTINATION);

  const bundle = {
    destinationId,
    destinationName,
    updatedAt: new Date().toISOString(),
    candidates: merged,
  };
  writeCandidateBundle(bundle);
  return bundle;
}

export function localImagePath(destId) {
  return join(IMAGES_DIR, `${destId}-hero.jpg`);
}

export function publicImageSrc(destId) {
  return `/images/destinations/${destId}-hero.jpg`;
}

export function hasValidLocalImage(entry) {
  if (!entry?.src || typeof entry.src !== 'string') return false;
  const rel = entry.src.replace(/^\//, '');
  const full = join(ROOT, rel);
  return existsSync(full) && statSync(full).size > 0;
}

export function resizeImage(filePath) {
  try {
    execSync(`sips -Z ${MAX_EDGE_PX} "${filePath}" --out "${filePath}"`, {
      stdio: 'pipe',
    });
  } catch (err) {
    console.warn(`  Warning: sips resize failed for ${filePath}: ${err.message}`);
  }
}

export async function downloadImage(url, destPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': WIKIMEDIA_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}) from ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  resizeImage(destPath);
}

export function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function manifestKey(id) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(id) ? id : JSON.stringify(id);
}

export function quoteManifestObjectKeys(objectLiteral) {
  return objectLiteral.replace(
    /^(\s*)([a-zA-Z_$][\w-]*)(\s*:)/gm,
    (full, indent, key, colon) => {
      if (key.includes('-')) return `${indent}${JSON.stringify(key)}${colon}`;
      return full;
    },
  );
}

export function loadManifest() {
  const content = readFileSync(MANIFEST_PATH, 'utf8');
  const match = content.match(/window\.DESTINATION_IMAGE_MANIFEST\s*=\s*(\{[\s\S]*\});/);
  if (!match) throw new Error(`Could not parse ${MANIFEST_PATH}`);
  const normalized = quoteManifestObjectKeys(match[1]);
  return Function(`return ${normalized}`)();
}

export function formatManifestEntry(id, entry) {
  const key = manifestKey(id);
  const lines = [
    `  ${key}: {`,
    `    src: ${JSON.stringify(entry.src)},`,
    `    alt: ${JSON.stringify(entry.alt)},`,
    `    credit: ${JSON.stringify(entry.credit)},`,
    `    sourceUrl: ${JSON.stringify(entry.sourceUrl)},`,
  ];
  if (entry.photographer) lines.push(`    photographer: ${JSON.stringify(entry.photographer)},`);
  if (entry.photographerUrl) lines.push(`    photographerUrl: ${JSON.stringify(entry.photographerUrl)},`);
  lines.push(`    license: ${JSON.stringify(entry.license)},`);
  if (entry.source) lines.push(`    source: ${JSON.stringify(entry.source)},`);
  lines.push(`    objectPosition: ${JSON.stringify(entry.objectPosition)},`);
  if (entry.queryUsed) lines.push(`    queryUsed: ${JSON.stringify(entry.queryUsed)},`);
  if (entry.pexelsPhotoId != null) lines.push(`    pexelsPhotoId: ${entry.pexelsPhotoId},`);
  if (entry.wikimediaFile != null) lines.push(`    wikimediaFile: ${JSON.stringify(entry.wikimediaFile)},`);
  if (entry.reviewed === true) lines.push('    reviewed: true,');
  else if (entry.reviewed === false) lines.push('    reviewed: false,');
  lines.push('  },');
  return lines.join('\n');
}

export function writeManifest(manifest) {
  const orderedIds = DESTINATIONS.map((d) => d.id);
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

export function escapeTableCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function writeSelectionReport(manifest, notesById = new Map()) {
  const rows = DESTINATIONS.map((dest) => {
    const entry = manifest[dest.id];
    if (!entry) {
      return {
        id: dest.id,
        name: dest.name,
        localPath: '—',
        queryUsed: '—',
        sourceUrl: '—',
        credit: '—',
        notes: 'No image selected',
        reviewed: 'false',
      };
    }
    return {
      id: dest.id,
      name: dest.name,
      localPath: entry.src || '—',
      queryUsed: entry.queryUsed || '—',
      sourceUrl: entry.sourceUrl || '—',
      credit: entry.credit || entry.photographer || '—',
      notes: notesById.get(dest.id) || (entry.reviewed ? 'Human-approved selection' : (entry.source || 'Existing entry')),
      reviewed: entry.reviewed === false ? 'false' : 'true',
    };
  });

  const lines = [
    '# Destination image selections',
    '',
    'Hero image selections for GoTango destination modals.',
    'Entries with `reviewed: true` were approved via the hero review workflow.',
    '',
    '| Destination ID | Destination Name | Local Image Path | Query Used | Source URL | Credit | Notes | Reviewed |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const row of rows) {
    lines.push(
      `| ${escapeTableCell(row.id)} | ${escapeTableCell(row.name)} | ${escapeTableCell(row.localPath)} | ${escapeTableCell(row.queryUsed)} | ${escapeTableCell(row.sourceUrl)} | ${escapeTableCell(row.credit)} | ${escapeTableCell(row.notes)} | ${escapeTableCell(row.reviewed)} |`,
    );
  }

  lines.push('');
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
}

export function candidateToManifestEntry(destId, candidate) {
  const entry = {
    src: publicImageSrc(destId),
    alt: candidate.alt,
    credit: candidate.credit,
    sourceUrl: candidate.sourceUrl,
    license: candidate.license,
    source: candidate.source,
    objectPosition: candidate.objectPosition || 'center 35%',
    queryUsed: candidate.queryUsed,
    reviewed: true,
  };
  if (candidate.photographer) entry.photographer = candidate.photographer;
  if (candidate.photographerUrl) entry.photographerUrl = candidate.photographerUrl;
  if (candidate.pexelsPhotoId != null) entry.pexelsPhotoId = candidate.pexelsPhotoId;
  if (candidate.wikimediaFile) entry.wikimediaFile = candidate.wikimediaFile;
  return entry;
}

export function readApprovedSelections() {
  if (!existsSync(APPROVED_PATH)) return null;
  return JSON.parse(readFileSync(APPROVED_PATH, 'utf8'));
}

export function writeApprovedSelections(data) {
  writeFileSync(APPROVED_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
