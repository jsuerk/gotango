import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { DESTINATIONS } from '../destinations.config.js';
import {
  applyActivityConfidenceCaps,
  applyCalibration,
  applyPublicMovement,
  B_ACTIVITY_LED_WEIGHTS,
  buildDestinationPanels,
  buildMarketActivityPercentiles,
  buildPanelFromBacktestRows,
  CALIBRATION_FACTOR,
  CATEGORY_MODEL_VERSION,
  classifyDestination,
  computeActivity3d,
  computeGoTangoScoreResponse,
  computeRawComposite,
  DEFAULT_PARAMS,
  displayCategoryToKey,
  goTangoScoreBand,
  GOTANGO_SCORE_VERSION,
  heatingEvidence,
  logActivityScore,
  matureObservationFlags,
  median,
  MODERATE_CAP_SYSTEM,
  nowCoolingDisplayEligible,
  nowHeatingDisplayEligible,
  NOW_MIN_PUBLIC_SCORE,
  ownHistoryPercentileScore,
  percentile,
  percentileRankAverageTies,
  publicGoTangoScore,
  replayDestination,
  SCORE_MODEL,
  scoreDestinationPublicHistory,
  updateDirectionStreak,
  validateGoTangoScoreResponse,
  weightedOutlook,
} from '../gotango-score-v2.lib.js';
import {
  JUNE_16_GOLDEN_SCORES,
  JUNE_16_NOW_COOLING,
  JUNE_16_NOW_HEATING,
} from './fixtures/gotango-score-v2-golden-june16.fixture.js';
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
const CALIBRATION_PATH = join(
  process.env.HOME || '',
  'Downloads/gotango-score-quality-calibration-results.json',
);

function loadGoldenBacktest() {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
}

function loadCorrectedResults() {
  return JSON.parse(readFileSync(CORRECTED_PATH, 'utf8'));
}

function loadCalibrationResults() {
  return JSON.parse(readFileSync(CALIBRATION_PATH, 'utf8'));
}

function replayAllScored(panelByDest) {
  const classified = new Map();
  for (const dest of DESTINATIONS) {
    const rows = panelByDest.get(dest.id) || [];
    classified.set(dest.id, replayDestination(rows, DEFAULT_PARAMS).daily);
  }
  const marketByDate = buildMarketActivityPercentiles(classified);
  const scoredByDest = new Map();
  for (const dest of DESTINATIONS) {
    const rows = panelByDest.get(dest.id) || [];
    const { series, daily } = replayDestination(rows, DEFAULT_PARAMS);
    scoredByDest.set(
      dest.id,
      scoreDestinationPublicHistory(dest.id, series, daily, marketByDate),
    );
  }
  return { classified, marketByDate, scoredByDest };
}

test('version metadata constants', () => {
  assert.equal(GOTANGO_SCORE_VERSION, 'gotango_score_v2_1_activity_led');
  assert.equal(SCORE_MODEL, 'B_ORIGINAL_cap_15');
  assert.equal(CATEGORY_MODEL_VERSION, 'gotango_category_v2');
  assert.equal(NOW_MIN_PUBLIC_SCORE, 60);
});

test('logActivityScore uses ln(101) denominator', () => {
  assert.equal(logActivityScore(0), 0);
  assert.ok(Math.abs(logActivityScore(100) - 100) < 0.01);
  assert.ok(logActivityScore(50) > 80);
});

test('activity_3d weighted private signal blend', () => {
  const signals = [10, 20, 30, 40];
  const a3 = computeActivity3d(signals, 3);
  const expected = 40 * 0.5 + 30 * 0.3 + 20 * 0.2;
  assert.ok(Math.abs(a3 - expected) < 1e-9);
});

test('calibration factor 1.15 centers on 50', () => {
  assert.equal(applyCalibration(50), 50);
  assert.ok(Math.abs(applyCalibration(60) - (50 + 1.15 * 10)) < 1e-9);
});

test('raw composite uses B activity-led weights', () => {
  const components = {
    absolute_activity_score: 80,
    sustained_activity_score: 70,
    market_activity_percentile_score: 60,
    own_history_percentile_score: 50,
    recent_signal_score: 40,
    confidence_score: 100,
  };
  const raw = computeRawComposite(components, B_ACTIVITY_LED_WEIGHTS);
  const expected =
    80 * 0.4 + 70 * 0.2 + 60 * 0.2 + 50 * 0.1 + 40 * 0.05 + 100 * 0.05;
  assert.equal(raw, Math.round(expected * 100) / 100);
});

test('activity confidence caps bind tightest threshold', () => {
  const row = { activity_3d: 2.5, confidence: 'high', truncation_status: 'confirmed_complete' };
  const capped = applyActivityConfidenceCaps(90, row);
  assert.equal(capped.score, 50);
  assert.ok(capped.diagnostics[0].includes('activity_3d_below_3'));
});

test('each moderate activity cap threshold', () => {
  for (const [threshold, max] of MODERATE_CAP_SYSTEM.activity_caps) {
    const row = {
      activity_3d: threshold - 0.01,
      confidence: 'high',
      truncation_status: 'confirmed_complete',
    };
    const capped = applyActivityConfidenceCaps(95, row);
    assert.equal(capped.score, max);
  }
});

test('low confidence cap at 75', () => {
  const row = { activity_3d: 50, confidence: 'low', truncation_status: 'confirmed_complete' };
  const capped = applyActivityConfidenceCaps(95, row);
  assert.equal(capped.score, 75);
});

test('truncated first observation capped at 80', () => {
  const row = { activity_3d: 50, confidence: 'high', truncation_status: 'truncated' };
  const capped = applyActivityConfidenceCaps(95, row, { truncatedWithoutPrior: true });
  assert.equal(capped.score, 80);
});

test('truncated hold_prior keeps exact prior public score', () => {
  const moved = applyPublicMovement(95, 66.13, {
    mature: true,
    isFirstMatureDay: false,
    isTruncated: true,
    movementCap: 15,
  });
  assert.equal(moved.score, 66.13);
  assert.deepEqual(moved.diagnostics, ['truncated_hold_prior']);
});

test('sequential movement cap limits to +/-15', () => {
  const up = applyPublicMovement(90, 60, {
    mature: true,
    isFirstMatureDay: false,
    isTruncated: false,
    movementCap: 15,
  });
  assert.equal(up.score, 75);
  const down = applyPublicMovement(40, 60, {
    mature: true,
    isFirstMatureDay: false,
    isTruncated: false,
    movementCap: 15,
  });
  assert.equal(down.score, 45);
});

test('first mature day exempt from movement cap', () => {
  const moved = applyPublicMovement(90, 40, {
    mature: true,
    isFirstMatureDay: true,
    isTruncated: false,
    movementCap: 15,
  });
  assert.equal(moved.score, 90);
});

test('percentile rank average ties matches calibration script', () => {
  assert.equal(percentileRankAverageTies([1, 2, 2, 4], 2), 50);
  assert.equal(percentileRankAverageTies([5], 5), 50);
});

test('own-history percentile neutral 50 with fewer than 5 observations', () => {
  const series = { activity_3d: [1, 2, 3, 4] };
  assert.equal(ownHistoryPercentileScore(series.activity_3d, 3, 4), 50);
});

test('public score rounds internal two-decimal value', () => {
  assert.equal(publicGoTangoScore(74.14), 74);
  assert.equal(publicGoTangoScore(74.99), 75);
  assert.equal(publicGoTangoScore(99.89), 100);
});

test('inclusive score band boundaries', () => {
  const cases = {
    0: 'very_limited',
    19.99: 'very_limited',
    20: 'quiet',
    39.99: 'quiet',
    40: 'moderate_or_developing',
    59.99: 'moderate_or_developing',
    60: 'meaningful_activity',
    74: 'meaningful_activity',
    74.14: 'meaningful_activity',
    74.99: 'meaningful_activity',
    75: 'strong_and_highly_relevant',
    89.99: 'strong_and_highly_relevant',
    90: 'exceptional',
    100: 'exceptional',
  };
  for (const [score, band] of Object.entries(cases)) {
    assert.equal(goTangoScoreBand(Number(score)), band, `score ${score}`);
  }
});

test('score band tests match calibration export', () => {
  const calib = loadCalibrationResults();
  const expected = calib.score_band_tests.corrected_inclusive_bands;
  for (const [score, band] of Object.entries(expected)) {
    assert.equal(goTangoScoreBand(Number(score)), band);
  }
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
  assert.equal(response.score_model, SCORE_MODEL);
  const total = Object.values(response.category_counts).reduce((a, b) => a + b, 0);
  assert.equal(total, 2);
});

test('golden June 16 categories unchanged', () => {
  const data = loadGoldenBacktest();
  const byDest = buildPanelFromBacktestRows(data.deduped_daily_panel);
  const { scoredByDest } = replayAllScored(byDest);
  const categoryCounts = { heating_up: 0, in_season: 0, steady: 0, cooling: 0 };

  for (const dest of DESTINATIONS) {
    const daily = scoredByDest.get(dest.id) || [];
    const latest = daily[daily.length - 1];
    if (latest?.date === '2026-06-16') {
      categoryCounts[displayCategoryToKey(latest.confirmed_category)] += 1;
    }
  }

  assert.equal(categoryCounts.heating_up, 5);
  assert.equal(categoryCounts.in_season, 18);
  assert.equal(categoryCounts.steady, 27);
  assert.equal(categoryCounts.cooling, 1);
});

test('golden June 16 focus destination internal scores', () => {
  const data = loadGoldenBacktest();
  const byDest = buildPanelFromBacktestRows(data.deduped_daily_panel);
  const { scoredByDest } = replayAllScored(byDest);

  for (const [destId, golden] of Object.entries(JUNE_16_GOLDEN_SCORES)) {
    const daily = scoredByDest.get(destId) || [];
    const latest = daily.find((r) => r.date === '2026-06-16');
    assert.ok(latest, `${golden.name} missing June 16 row`);
    assert.ok(
      Math.abs(latest.go_tango_score_internal - golden.internal) < 0.011,
      `${golden.name}: got ${latest.go_tango_score_internal} expected ${golden.internal}`,
    );
    assert.equal(publicGoTangoScore(latest.go_tango_score_internal), golden.public);
  }
});

test('no consecutive mature valid daily moves above 15', () => {
  const data = loadGoldenBacktest();
  const byDest = buildPanelFromBacktestRows(data.deduped_daily_panel);
  const { scoredByDest } = replayAllScored(byDest);
  let violations = 0;

  for (const dest of DESTINATIONS) {
    const daily = scoredByDest.get(dest.id) || [];
    for (let i = 1; i < daily.length; i++) {
      const prev = daily[i - 1];
      const cur = daily[i];
      const gapDays =
        (Date.parse(`${cur.date}T00:00:00Z`) - Date.parse(`${prev.date}T00:00:00Z`)) /
        86400000;
      const { mature } = matureObservationFlags(
        replayDestination(byDest.get(dest.id) || []).series.activity_3d,
        i,
      );
      const prevMature = matureObservationFlags(
        replayDestination(byDest.get(dest.id) || []).series.activity_3d,
        i - 1,
      ).mature;
      if (!prevMature || !mature || gapDays !== 1) continue;
      const move = Math.abs(cur.go_tango_score_internal - prev.go_tango_score_internal);
      if (move > 15.001) violations++;
    }
  }
  assert.equal(violations, 0);
});

test('June 16 Now shortlist at minimum score 60', () => {
  const data = loadGoldenBacktest();
  const byDest = buildPanelFromBacktestRows(data.deduped_daily_panel);
  const { scoredByDest } = replayAllScored(byDest);
  const heating = [];
  const cooling = [];

  for (const dest of DESTINATIONS) {
    const daily = scoredByDest.get(dest.id) || [];
    const latest = daily.find((r) => r.date === '2026-06-16');
    if (!latest) continue;
    const publicScore = publicGoTangoScore(latest.go_tango_score_internal);
    if (
      nowHeatingDisplayEligible(latest) &&
      publicScore >= NOW_MIN_PUBLIC_SCORE
    ) {
      heating.push(dest.name);
    }
    if (
      nowCoolingDisplayEligible(latest) &&
      publicScore >= NOW_MIN_PUBLIC_SCORE
    ) {
      cooling.push(dest.name);
    }
  }

  heating.sort((a, b) => a.localeCompare(b));
  const expectedHeating = [...JUNE_16_NOW_HEATING].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(heating, expectedHeating);
  assert.deepEqual(cooling, JUNE_16_NOW_COOLING);
});

test('all 51 public destinations scored once in golden replay', () => {
  const data = loadGoldenBacktest();
  const byDest = buildPanelFromBacktestRows(data.deduped_daily_panel);
  const { scoredByDest } = replayAllScored(byDest);
  assert.equal(scoredByDest.size, DESTINATIONS.length);
  for (const dest of DESTINATIONS) {
    const daily = scoredByDest.get(dest.id) || [];
    const latest = daily[daily.length - 1];
    assert.ok(latest?.go_tango_score_internal != null, dest.id);
    assert.ok(latest?.go_tango_score_band, dest.id);
  }
});

test('Aspen category sequence unchanged', () => {
  const data = loadGoldenBacktest();
  const byDest = buildPanelFromBacktestRows(data.deduped_daily_panel);
  const { daily } = replayDestination(byDest.get('aspen') || [], DEFAULT_PARAMS);
  const june10 = daily.find((r) => r.date === '2026-06-10');
  const june11 = daily.find((r) => r.date === '2026-06-11');
  assert.equal(june10.confirmed_category, 'Heating Up');
  assert.equal(june11.confirmed_category, 'In Season');
});

test('validateGoTangoScoreResponse catches fatal mismatches', () => {
  const publicIds = DESTINATIONS.map((d) => d.id);
  const bad = { go_tango_score_version: 'legacy', total_destinations: 0, destinations: [] };
  const result = validateGoTangoScoreResponse(bad, '2026-06-16T14:00:00.000Z', publicIds);
  assert.equal(result.ok, false);
  assert.ok(result.fatal.includes('invalid_version'));
});

test('legacy helpers retained for fallback compatibility', () => {
  assert.ok(Math.abs(percentile([1, 2, 3, 4], 55) - 2.65) < 1e-9);
  const val = weightedOutlook([80, 70], [0.35, 0.25, 0.18, 0.13, 0.09]);
  assert.ok(Math.abs(val - 75.833) < 0.01);
  const [streak, dir] = updateDirectionStreak(3, 'strengthening', 'stable', false);
  assert.equal(streak, 0);
  assert.equal(dir, 'stable');
  assert.equal(heatingEvidence(0, { activity_3d: [6], baseline_median: [4] }, 2, 'strengthening', false), false);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('corrected results document recommends category params unchanged', () => {
  const doc = loadCorrectedResults();
  const label = doc.recommended_category_model?.parameter_label;
  assert.match(label, /abs=1\.0\|pct=5%\|cool=80%\|season=B/);
});
