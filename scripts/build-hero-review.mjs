#!/usr/bin/env node
/**
 * Build a local review page for destination hero candidates.
 *
 * Usage:
 *   node scripts/build-hero-review.mjs
 *   open destination-hero-review.html
 */

import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { DESTINATIONS } from '../destinations.config.js';
import { TARGETED_REFETCH_IDS } from './destination-hero-profiles.mjs';
import {
  readAllCandidateBundles,
  readApprovedSelections,
  REVIEW_HTML_PATH,
  loadManifest,
} from './hero-candidate-utils.mjs';

function buildReviewData() {
  const bundlesById = new Map(readAllCandidateBundles().map((b) => [b.destinationId, b]));
  let manifestData = {};
  try {
    manifestData = loadManifest();
  } catch {
    manifestData = {};
  }

  const approved = readApprovedSelections();
  const destinations = DESTINATIONS.map((dest) => {
    const bundle = bundlesById.get(dest.id);
    const current = manifestData[dest.id] || null;
    const selection = approved?.selections?.[dest.id] || null;
    return {
      id: dest.id,
      name: dest.name,
      region: dest.region,
      flagged: TARGETED_REFETCH_IDS.includes(dest.id),
      candidates: bundle?.candidates || [],
      currentHero: current ? {
        src: current.src,
        alt: current.alt,
        source: current.source || current.credit,
        reviewed: current.reviewed !== false,
      } : null,
      approvedCandidateId: selection?.candidateId || null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    destinationCount: destinations.length,
    destinations,
  };
}

function renderHtml(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GoTango — Destination Hero Review</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0d1117;
      --panel: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --accent: #58a6ff;
      --good: #3fb950;
      --warn: #d29922;
      --bad: #f85149;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.45;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: rgba(13, 17, 23, 0.95);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
      padding: 16px 20px;
    }
    h1 { margin: 0 0 6px; font-size: 1.25rem; font-weight: 600; }
    .sub { color: var(--muted); font-size: 0.9rem; }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      margin-top: 12px;
    }
    .toolbar input, .toolbar select, .toolbar button {
      font: inherit;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);
      padding: 8px 12px;
    }
    .toolbar button {
      cursor: pointer;
      background: #21262d;
    }
    .toolbar button.primary { background: #238636; border-color: #2ea043; }
    .toolbar button:hover { border-color: var(--accent); }
    .stats { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; font-size: 0.9rem; }
    .stats span strong { color: var(--accent); }
    main { padding: 20px; max-width: 1400px; margin: 0 auto; }
    .dest {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel);
      margin-bottom: 18px;
      overflow: hidden;
    }
    .dest-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }
    .dest-title { font-weight: 600; }
    .dest-meta { color: var(--muted); font-size: 0.85rem; }
    .badge {
      font-size: 0.75rem;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid var(--border);
      white-space: nowrap;
    }
    .badge.ok { color: var(--good); border-color: #238636; }
    .badge.pending { color: var(--warn); border-color: #9e6a03; }
    .badge.none { color: var(--muted); }
    .badge.flagged { color: var(--bad); border-color: #da3633; }
    .current {
      padding: 10px 16px;
      font-size: 0.85rem;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
    }
    .candidates {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      padding: 14px;
    }
    .card {
      border: 2px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      background: #0d1117;
      display: flex;
      flex-direction: column;
    }
    .card.selected { border-color: var(--good); box-shadow: 0 0 0 1px var(--good); }
    .card img {
      width: 100%;
      aspect-ratio: 16 / 10;
      object-fit: cover;
      background: #010409;
      display: block;
    }
    .card-body { padding: 10px 12px 12px; flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .source { font-size: 0.8rem; color: var(--accent); }
    .alt { font-size: 0.85rem; color: var(--text); }
    .meta { font-size: 0.75rem; color: var(--muted); }
    .card-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; }
    .card-actions button, .card-actions a {
      font-size: 0.8rem;
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #21262d;
      color: var(--text);
      text-decoration: none;
      cursor: pointer;
    }
    .card-actions a:hover, .card-actions button:hover { border-color: var(--accent); }
    .empty { padding: 16px; color: var(--muted); font-size: 0.9rem; }
    .hidden { display: none !important; }
    footer {
      padding: 24px 20px 40px;
      color: var(--muted);
      font-size: 0.85rem;
      text-align: center;
    }
    code { background: #21262d; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <header>
    <h1>Destination Hero Review</h1>
    <p class="sub">Pick one candidate per destination. Export approvals, then run <code>node scripts/apply-hero-selections.mjs</code>.</p>
    <div class="toolbar">
      <input id="search" type="search" placeholder="Search destinations..." />
      <select id="filter">
        <option value="all">All destinations</option>
        <option value="needs-review">Needs review</option>
        <option value="flagged">Flagged only</option>
        <option value="approved">Approved</option>
        <option value="no-candidates">No candidates</option>
      </select>
      <button id="exportBtn" class="primary">Export approvals JSON</button>
      <button id="importBtn">Import approvals JSON</button>
      <input id="importFile" type="file" accept="application/json" class="hidden" />
    </div>
    <div class="stats" id="stats"></div>
  </header>
  <main id="list"></main>
  <footer>Generated ${data.generatedAt}</footer>
  <script>
    const DATA = ${json};
    const STORAGE_KEY = 'gotango-hero-review-selections-v1';
    let selections = loadSelections();

    function loadSelections() {
      const fromFile = DATA.destinations.reduce((acc, d) => {
        if (d.approvedCandidateId) acc[d.id] = d.approvedCandidateId;
        return acc;
      }, {});
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return { ...fromFile, ...saved };
      } catch {
        return fromFile;
      }
    }

    function saveSelections() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
      render();
    }

    function candidateById(dest, candidateId) {
      return (dest.candidates || []).find((c) => c.candidateId === candidateId);
    }

    function isApproved(dest) {
      const id = selections[dest.id];
      return !!id && !!candidateById(dest, id);
    }

    function matchesFilter(dest) {
      const q = document.getElementById('search').value.trim().toLowerCase();
      if (q && !dest.id.includes(q) && !dest.name.toLowerCase().includes(q) && !(dest.region || '').toLowerCase().includes(q)) {
        return false;
      }
      const filter = document.getElementById('filter').value;
      if (filter === 'needs-review') return dest.candidates.length && !isApproved(dest);
      if (filter === 'flagged') return dest.flagged;
      if (filter === 'approved') return isApproved(dest);
      if (filter === 'no-candidates') return !dest.candidates.length;
      return true;
    }

    function renderStats() {
      const total = DATA.destinations.length;
      const withCandidates = DATA.destinations.filter((d) => d.candidates.length).length;
      const approved = DATA.destinations.filter((d) => isApproved(d)).length;
      document.getElementById('stats').innerHTML = [
        '<span><strong>' + approved + '</strong> / ' + total + ' approved</span>',
        '<span><strong>' + withCandidates + '</strong> with candidates</span>',
        '<span><strong>' + DATA.destinations.filter((d) => d.flagged).length + '</strong> flagged</span>',
      ].join('');
    }

    function renderCard(dest, candidate) {
      const selected = selections[dest.id] === candidate.candidateId;
      const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
      return '<article class="card' + (selected ? ' selected' : '') + '" data-dest="' + esc(dest.id) + '" data-candidate="' + esc(candidate.candidateId) + '">' +
        '<img src="' + esc(candidate.previewUrl || candidate.thumbnailUrl) + '" alt="' + esc(candidate.alt) + '" loading="lazy" />' +
        '<div class="card-body">' +
          '<div class="source">' + esc(candidate.source) + ' · score ' + esc(candidate.score) + '</div>' +
          '<div class="alt">' + esc(candidate.alt) + '</div>' +
          '<div class="meta">Query: ' + esc(candidate.queryUsed) + '<br/>License: ' + esc(candidate.license) + '</div>' +
          '<div class="card-actions">' +
            '<button type="button" data-action="select">Select</button>' +
            '<a href="' + esc(candidate.sourceUrl) + '" target="_blank" rel="noopener">Source</a>' +
          '</div>' +
        '</div>' +
      '</article>';
    }

    function renderDestination(dest) {
      const approved = isApproved(dest);
      const badges = [];
      if (dest.flagged) badges.push('<span class="badge flagged">flagged</span>');
      if (approved) badges.push('<span class="badge ok">approved</span>');
      else if (dest.candidates.length) badges.push('<span class="badge pending">needs review</span>');
      else badges.push('<span class="badge none">no candidates</span>');

      const current = dest.currentHero
        ? '<div class="current">Current manifest: <strong>' + esc(dest.currentHero.source) + '</strong> — ' + esc(dest.currentHero.alt) +
          (dest.currentHero.reviewed ? ' (reviewed)' : ' (unreviewed)') + '</div>'
        : '<div class="current">No manifest entry yet.</div>';

      const cards = dest.candidates.length
        ? '<div class="candidates">' + dest.candidates.map((c) => renderCard(dest, c)).join('') + '</div>'
        : '<div class="empty">Run fetch scripts with <code>--candidates</code> to populate options.</div>';

      return '<section class="dest" data-dest="' + esc(dest.id) + '">' +
        '<div class="dest-head">' +
          '<div><div class="dest-title">' + esc(dest.name) + '</div><div class="dest-meta">' + esc(dest.id) + ' · ' + esc(dest.region) + '</div></div>' +
          '<div>' + badges.join(' ') + '</div>' +
        '</div>' +
        current +
        cards +
      '</section>';
    }

    function esc(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    }

    function render() {
      const list = document.getElementById('list');
      const items = DATA.destinations.filter(matchesFilter).map(renderDestination);
      list.innerHTML = items.join('') || '<p class="empty">No destinations match this filter.</p>';
      renderStats();
    }

    function exportApprovals() {
      const out = {
        version: 1,
        updatedAt: new Date().toISOString(),
        selections: {},
      };
      for (const dest of DATA.destinations) {
        const candidateId = selections[dest.id];
        const candidate = candidateById(dest, candidateId);
        if (!candidate) continue;
        out.selections[dest.id] = {
          destinationId: dest.id,
          destinationName: dest.name,
          candidateId: candidate.candidateId,
          approvedAt: new Date().toISOString(),
          candidate,
        };
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'destination-hero-selections-approved.json';
      a.click();
      URL.revokeObjectURL(url);
    }

    document.getElementById('list').addEventListener('click', (event) => {
      const card = event.target.closest('.card');
      if (!card) return;
      const action = event.target.closest('[data-action="select"]');
      if (!action) return;
      selections[card.dataset.dest] = card.dataset.candidate;
      saveSelections();
    });

    document.getElementById('search').addEventListener('input', render);
    document.getElementById('filter').addEventListener('change', render);
    document.getElementById('exportBtn').addEventListener('click', exportApprovals);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      for (const [destId, row] of Object.entries(data.selections || {})) {
        selections[destId] = row.candidateId || row.candidate?.candidateId;
      }
      saveSelections();
      event.target.value = '';
    });

    render();
  </script>
</body>
</html>`;
}

function main() {
  const data = buildReviewData();
  const html = renderHtml(data);
  writeFileSync(REVIEW_HTML_PATH, html, 'utf8');
  const withCandidates = data.destinations.filter((d) => d.candidates.length).length;
  console.log(`Wrote ${REVIEW_HTML_PATH}`);
  console.log(`${withCandidates}/${data.destinationCount} destinations have candidates`);
  console.log('Open the HTML file in your browser, approve picks, export JSON, then run apply-hero-selections.mjs');
}

main();
