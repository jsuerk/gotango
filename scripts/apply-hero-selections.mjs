#!/usr/bin/env node
/**
 * Apply human-approved hero selections to the manifest and download images.
 *
 * Usage:
 *   node scripts/apply-hero-selections.mjs
 *   node scripts/apply-hero-selections.mjs --file path/to/destination-hero-selections-approved.json
 *   node scripts/apply-hero-selections.mjs --dry-run
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_PATH,
  candidateToManifestEntry,
  downloadImage,
  ensureDirs,
  loadManifest,
  localImagePath,
  writeApprovedSelections,
  writeManifest,
  writeSelectionReport,
} from './hero-candidate-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const FILE_ARG = parseFileArg();

function die(message) {
  console.error(message);
  process.exit(1);
}

function parseFileArg() {
  const idx = process.argv.indexOf('--file');
  if (idx === -1) return APPROVED_PATH;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith('--')) die('--file requires a path to the approved selections JSON');
  return val.startsWith('/') ? val : join(__dirname, '..', val);
}

function readApprovals(path) {
  if (!existsSync(path)) {
    die(
      `Missing approvals file: ${path}\n` +
      'Export destination-hero-selections-approved.json from destination-hero-review.html first.',
    );
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function main() {
  const approvals = readApprovals(FILE_ARG);
  const selections = approvals.selections || {};
  const ids = Object.keys(selections);
  if (!ids.length) die('No selections found in approvals file.');

  ensureDirs();
  const manifest = loadManifest();
  const notesById = new Map();
  const applied = [];
  const skipped = [];

  console.log(`${DRY_RUN ? 'Dry run —' : 'Applying'} ${ids.length} approved selection(s) from ${FILE_ARG}`);

  for (const destId of ids) {
    const row = selections[destId];
    const candidate = row.candidate;
    if (!candidate?.downloadUrl) {
      skipped.push(destId);
      console.log(`Skip ${destId} (missing candidate payload)`);
      continue;
    }

    console.log(`${DRY_RUN ? 'Would apply' : 'Apply'} ${destId} ← ${candidate.source} (${candidate.candidateId})`);

    if (!DRY_RUN) {
      const outPath = localImagePath(destId);
      await downloadImage(candidate.downloadUrl, outPath);
      manifest[destId] = candidateToManifestEntry(destId, candidate);
      notesById.set(destId, `Approved ${candidate.source}; score=${candidate.score}`);
      applied.push(destId);
    }
  }

  if (!DRY_RUN) {
    writeManifest(manifest);
    writeSelectionReport(manifest, notesById);
    writeApprovedSelections(approvals);
  }

  console.log('\nDone.');
  console.log(`Applied: ${applied.length}${applied.length ? ` (${applied.join(', ')})` : ''}`);
  console.log(`Skipped: ${skipped.length}${skipped.length ? ` (${skipped.join(', ')})` : ''}`);
  if (!DRY_RUN && applied.length) {
    console.log('Updated destination-images.config.js and destination-image-selections.md');
  }
}

main().catch((err) => {
  die(`Unexpected error: ${err.stack || err.message}`);
});
