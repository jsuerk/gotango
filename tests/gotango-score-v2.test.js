import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DESTINATIONS } from '../destinations.config.js';
import {
  buildDestinationPanels,
  buildPanelFromBacktestRows,
  classifyDestination,
  computeActivity3d,
  computeGoTangoScoreResponse,
  DEFAULT_PARAMS,
  displayCategoryToKey,
  GOTANGO_SCORE_VERSION,
  heatingEvidence,
  median,
  percentile,
  publicGoTangoScore,
  replayDestination,
  updateDirectionStreak,
  validateGoTangoScoreResponse,
  weightedOutlook,
} from '../gotango-score-v2.lib.js';
import { MINIMAL_FIXTURE } from './fixtures/gotango-score-v2-minimal.fixture.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(
  process.env.HOME || '',
  'Downloads/gotango-travel-outlook-backtest-data.json',
);
const CORRECTED_PATH = join(
  process.env.HOME || '',
  'Downloads/gotango-travel-outlook-corrected-results.json',
);

function loadGoldenBacktest() {
  const raw = readFileSync(GOLDEN_PATH, 'utf8');
  return JSON.parse(raw);
}

function loadCorrectedResults() {
  const raw = readFileSync(CORRECTED_PATH, 'utf8');
  return JSON.parse(raw);
}

test('percentile matches corrected backtest interpolation', () => {
  assert.ok(Math.abs(percentile([1, 2, 3, 4], 55) - 2.65) < 1e-9);
  assert.equal(percentile([10], 55), 10);
});

test('weighted O5 normalizes early history weights', () => {
  const val = weightedOutlook([80, 70], [0.35, 0.25, 0.18, 0.13, 0.09]);
  assert.ok(Math.abs(val - 75.833) < 0.01);
});

test('computeActivity3d requires three observations', () => {
  const signals = [1, 2, 3, 4];
  assert.equal(computeActivity3d(signals, 0), null);
  assert.equal(computeActivity3d(signals, 1), null);
  assert.ok(computeActivity3d(signals, 2) > 0);
});

test('stable day resets directional streak', () => {
  const [streak, dir] = updateDirectionStreak(3, 'strengthening', 'stable', false);
  assert.equal(streak, 0);
  assert.equal(dir, 'stable');
});

test('truncated day holds streak without increment or reset', () => {
  const [streak, dir] = updateDirectionStreak(2, 'strengthening', 'strengthening', true);
  assert.equal(streak, 2);
  assert.equal(dir, 'strengthening');
});

test('duplicate same-date history uses latest saved_at', () => {
  const panels = buildDestinationPanels(
    MINIMAL_FIXTURE.latestPayload,
    MINIMAL_FIXTURE.historyList,
    ['alpha', 'beta'],
  );
  const alpha = panels.get('alpha');
  const june5 = alpha.find((r) => r.date === '2026-06-05');
  assert.equal(june5.signal_score, 60);
});

test('minimal fixture returns one category per destination', () => {
  const response = computeGoTangoScoreResponse({
    latestPayload: MINIMAL_FIXTURE.latestPayload,
    historyList: MINIMAL_FIXTURE.historyList,
    publicDestinations: MINIMAL_FIXTURE.publicDestinations,
  });
  assert.equal(response.destinations.length, 2);
  const ids = new Set(response.destinations.map((d) => d.id));
  assert.equal(ids.size, 2);
  const total = Object.values(response.category_counts).reduce((a, b) => a + b, 0);
  assert.equal(total, 2);
});

test('golden June 16 replay matches corrected results', () => {
  const data = loadGoldenBacktest();
  const panel = data.deduped_daily_panel;
  const byDest = buildPanelFromBacktestRows(panel);
  const publicByName = new Map(DESTINATIONS.map((d) => [d.name, d]));

  const categoryCounts = { heating_up: 0, in_season: 0, steady: 0, cooling: 0 };
  const nowHeating = [];
  const nowCooling = [];
  let aspenJune11 = null;

  for (const dest of DESTINATIONS) {
    const rows = byDest.get(dest.id) || [];
    const { daily } = replayDestination(rows, DEFAULT_PARAMS);
    const latest = daily[daily.length - 1];
    if (latest.date === '2026-06-16') {
      const key = displayCategoryToKey(latest.confirmed_category);
      categoryCounts[key] += 1;
      if (latest.now_heating_eligible) nowHeating.push(dest.name);
      if (latest.now_cooling_eligible) nowCooling.push(dest.name);
    }
    const j11 = daily.find((r) => r.date === '2026-06-11' && dest.id === 'aspen');
    if (j11) aspenJune11 = j11;
  }

  assert.equal(categoryCounts.heating_up, 5);
  assert.equal(categoryCounts.in_season, 18);
  assert.equal(categoryCounts.steady, 27);
  assert.equal(categoryCounts.cooling, 1);
  assert.deepEqual(nowHeating, ['Santa Fe']);
  assert.deepEqual(nowCooling, []);
  assert.equal(aspenJune11?.confirmed_category, 'In Season');
});

test('Aspen moves from Heating Up to In Season on 2026-06-11', () => {
  const data = loadGoldenBacktest();
  const byDest = buildPanelFromBacktestRows(data.deduped_daily_panel);
  const { daily } = replayDestination(byDest.get('aspen') || [], DEFAULT_PARAMS);
  const june10 = daily.find((r) => r.date === '2026-06-10');
  const june11 = daily.find((r) => r.date === '2026-06-11');
  assert.equal(june10.confirmed_category, 'Heating Up');
  assert.equal(june11.confirmed_category, 'In Season');
});

test('Aspen remains In Season through 2026-06-16', () => {
  const data = loadGoldenBacktest();
  const byDest = buildPanelFromBacktestRows(data.deduped_daily_panel);
  const { daily } = replayDestination(byDest.get('aspen') || [], DEFAULT_PARAMS);
  for (const date of ['2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14', '2026-06-15', '2026-06-16']) {
    const row = daily.find((r) => r.date === date);
    assert.equal(row?.confirmed_category, 'In Season', date);
  }
});

test('no direct Heating Up to Cooling transitions in golden replay', () => {
  const data = loadGoldenBacktest();
  const byDest = buildPanelFromBacktestRows(data.deduped_daily_panel);
  for (const dest of DESTINATIONS) {
    const { daily } = replayDestination(byDest.get(dest.id) || [], DEFAULT_PARAMS);
    for (let i = 1; i < daily.length; i++) {
      const prev = daily[i - 1].confirmed_category;
      const cur = daily[i].confirmed_category;
      assert.notEqual(`${prev}->${cur}`, 'Heating Up->Cooling');
      assert.notEqual(`${prev}->${cur}`, 'Cooling->Heating Up');
    }
  }
});

test('low baseline cannot create Heating Up evidence', () => {
  const series = {
    activity_3d: [6],
    baseline_median: [4],
  };
  assert.equal(heatingEvidence(0, series, 2, 'strengthening', false), false);
});

test('publicGoTangoScore rounds O5 to integer', () => {
  assert.equal(publicGoTangoScore(55.79), 56);
  assert.equal(publicGoTangoScore(46.46), 46);
});

test('validateGoTangoScoreResponse catches fatal mismatches', () => {
  const publicIds = DESTINATIONS.map((d) => d.id);
  const bad = { go_tango_score_version: 'legacy', total_destinations: 0, destinations: [] };
  const result = validateGoTangoScoreResponse(bad, '2026-06-16T14:00:00.000Z', publicIds);
  assert.equal(result.ok, false);
  assert.ok(result.fatal.includes('invalid_version'));
});

test('corrected results document recommends gotango_score_v2 model params', () => {
  const doc = loadCorrectedResults();
  const label = doc.recommended_category_model?.parameter_label;
  assert.match(label, /abs=1\.0\|pct=5%\|cool=80%\|season=B/);
  assert.equal(doc.recommended_outlook_model, 'O5');
});

test('median helper', () => {
  assert.equal(median([1, 3, 5]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('response version constant', () => {
  assert.equal(GOTANGO_SCORE_VERSION, 'gotango_score_v2');
});
