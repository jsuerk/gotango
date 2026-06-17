import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = join(__dirname, '../index.html');

const GOTANGO_SCORE_V2_VERSION = 'gotango_score_v2_1_activity_led';
const GOTANGO_SCORE_V2_MODEL = 'B_ORIGINAL_cap_15';
const NOW_MIN_PUBLIC_SCORE = 60;

function goTangoScoreBand(score) {
  if (score == null || !Number.isFinite(score)) return 'unknown';
  if (score >= 90) return 'exceptional';
  if (score >= 75) return 'strong_and_highly_relevant';
  if (score >= 60) return 'meaningful_activity';
  if (score >= 40) return 'moderate_or_developing';
  if (score >= 20) return 'quiet';
  if (score >= 0) return 'very_limited';
  return 'unknown';
}

function passesNowMinimumPublicScore(v2) {
  return Number(v2 && v2.go_tango_score) >= NOW_MIN_PUBLIC_SCORE;
}

/** Mirrors index.html preview-client helpers for deterministic tests. */
function buildGoTangoSignalRead(v2) {
  if (!v2) return null;
  const category = v2.confirmed_category;
  const dir = String(v2.candidate_direction || 'stable');
  const pendingExit = v2.pending_exit === true;
  const contraryDays = Number(v2.contrary_days || 0);
  const ratio = Number(v2.activity_ratio);
  const baseline = Number(v2.activity_baseline_7d);
  const isModestBase =
    (Number.isFinite(ratio) && ratio < 1.2) ||
    (Number.isFinite(baseline) && baseline <= 7);

  if (category === 'heating_up') {
    if (pendingExit && contraryDays === 1) {
      return 'The recent rise in arrivals has slowed slightly today.';
    }
    if (dir === 'strengthening') {
      return isModestBase
        ? 'Arrivals are picking up after a quieter stretch.'
        : 'Private arrivals are building.';
    }
    return 'Private arrivals are building.';
  }
  if (category === 'in_season') {
    if (dir === 'strengthening') return 'Already active and picking up.';
    if (dir === 'easing') return 'Still active after a softer day.';
    return 'Busy and holding.';
  }
  if (category === 'steady') {
    if (dir === 'strengthening') {
      return 'Activity picked up, but the broader trend is not confirmed.';
    }
    if (dir === 'easing') {
      return 'Activity softened, but the broader slowdown is not confirmed.';
    }
    return 'Holding near its recent pace.';
  }
  if (category === 'cooling') {
    if (pendingExit && contraryDays === 1) {
      return 'Cooling has slowed, and activity picked up today.';
    }
    if (dir === 'easing') return 'New arrivals are continuing to ease.';
    if (pendingExit) return 'Cooling has slowed, and activity picked up today.';
    return 'New arrivals are continuing to ease.';
  }
  return null;
}

function isValidGoTangoV2Record(v2) {
  if (!v2 || v2.go_tango_score_version !== GOTANGO_SCORE_V2_VERSION) return false;
  if (v2.score_model !== GOTANGO_SCORE_V2_MODEL) return false;
  if (!Number.isFinite(Number(v2.go_tango_score))) return false;
  if (!v2.confirmed_category) return false;
  if (!v2.score_band) return false;
  if (!Array.isArray(v2.go_tango_score_points_7d)) return false;
  return true;
}

function modalUsesGoTangoV2Score(dest, allDestinations, v2Map) {
  const destV2 = dest._gotango_v2 || v2Map.get(dest.id);
  if (!isValidGoTangoV2Record(destV2)) return false;
  const peerIds = Array.isArray(dest.peers) ? dest.peers : [];
  for (const id of peerIds) {
    const peer = allDestinations.find((d) => d && d.id === id);
    const v2 = (peer && peer._gotango_v2) || v2Map.get(id);
    if (!isValidGoTangoV2Record(v2)) return false;
  }
  return true;
}

function v2Truncated(v2) {
  return v2 && v2.truncation_status === 'truncated';
}

function isNowHeatingDisplayEligible(v2) {
  if (!v2 || v2.confirmed_category !== 'heating_up') return false;
  if (v2.data_confidence !== 'high') return false;
  if (v2Truncated(v2)) return false;
  if (Number(v2.activity_3d || 0) < 5) return false;
  const activelyMoving = v2.now_heating_eligible === true;
  const pendingFirstDay =
    v2.pending_exit === true && Number(v2.contrary_days) === 1;
  return activelyMoving || pendingFirstDay;
}

function isNowCoolingDisplayEligible(v2) {
  if (!v2 || v2.confirmed_category !== 'cooling') return false;
  if (v2.data_confidence !== 'high') return false;
  if (v2Truncated(v2)) return false;
  if (Number(v2.activity_baseline_7d || 0) < 5) return false;
  const activelyMoving = v2.now_cooling_eligible === true;
  const pendingFirstDay =
    v2.pending_exit === true && Number(v2.contrary_days) === 1;
  return activelyMoving || pendingFirstDay;
}

function buildNowHeatingShortlist(destinations) {
  const eligible = destinations.filter((d) => {
    const v2 = d && d._gotango_v2;
    return v2 && isNowHeatingDisplayEligible(v2) && passesNowMinimumPublicScore(v2);
  });
  const active = eligible.filter((d) => d._gotango_v2.now_heating_eligible);
  const pending = eligible.filter((d) => {
    const v2 = d._gotango_v2;
    return !v2.now_heating_eligible && v2.pending_exit && Number(v2.contrary_days) === 1;
  });
  return [...active, ...pending].slice(0, 6);
}

function buildNowCoolingShortlist(destinations) {
  const eligible = destinations.filter((d) => {
    const v2 = d && d._gotango_v2;
    return v2 && isNowCoolingDisplayEligible(v2) && passesNowMinimumPublicScore(v2);
  });
  const active = eligible.filter((d) => d._gotango_v2.now_cooling_eligible);
  const pending = eligible.filter((d) => {
    const v2 = d._gotango_v2;
    return !v2.now_cooling_eligible && v2.pending_exit && Number(v2.contrary_days) === 1;
  });
  return [...active, ...pending].slice(0, 3);
}

const V2_BADGE_LABELS = {
  heating_up: 'HEATING UP',
  in_season: 'IN SEASON',
  steady: 'STEADY',
  cooling: 'COOLING',
};

function v2BadgeLabel(category) {
  return V2_BADGE_LABELS[category] || V2_BADGE_LABELS.steady;
}

test('shared human-language templates', () => {
  assert.equal(
    buildGoTangoSignalRead({
      confirmed_category: 'heating_up',
      candidate_direction: 'strengthening',
      activity_ratio: 1.5,
      activity_baseline_7d: 12,
      pending_exit: false,
      contrary_days: 0,
    }),
    'Private arrivals are building.',
  );
  assert.equal(
    buildGoTangoSignalRead({
      confirmed_category: 'cooling',
      pending_exit: true,
      contrary_days: 1,
      candidate_direction: 'strengthening',
    }),
    'Cooling has slowed, and activity picked up today.',
  );
  assert.equal(
    buildGoTangoSignalRead({
      confirmed_category: 'in_season',
      candidate_direction: 'easing',
    }),
    'Still active after a softer day.',
  );
  const read = buildGoTangoSignalRead({ confirmed_category: 'steady', candidate_direction: 'stable' });
  assert.ok(read);
  assert.ok(!/day (easing|strengthening)/i.test(read));
  assert.ok(!/normalized|percentile|threshold|delta|volatility/i.test(read));
});

test('Nantucket category consistency under v2', () => {
  const nantucketV2 = {
    id: 'nantucket',
    go_tango_score_version: GOTANGO_SCORE_V2_VERSION,
    score_model: GOTANGO_SCORE_V2_MODEL,
    score_band: 'meaningful_activity',
    go_tango_score: 72,
    confirmed_category: 'heating_up',
    candidate_direction: 'strengthening',
    direction_streak_days: 3,
    pending_exit: false,
    contrary_days: 0,
    go_tango_score_points_7d: [60, 62, 65, 68, 70, 71, 72],
    activity_ratio: 1.4,
    activity_baseline_7d: 10,
  };
  const dest = {
    id: 'nantucket',
    name: 'Nantucket',
    peers: ['marthas-vineyard', 'hamptons'],
    go_tango_score: 72,
    confirmed_category: 'heating_up',
    _gotango_v2: nantucketV2,
  };
  const peers = [
    { id: 'marthas-vineyard', _gotango_v2: { ...nantucketV2, id: 'marthas-vineyard', go_tango_score: 55 } },
    { id: 'hamptons', _gotango_v2: { ...nantucketV2, id: 'hamptons', go_tango_score: 48 } },
  ];
  const v2Map = new Map([
    ['nantucket', nantucketV2],
    ['marthas-vineyard', peers[0]._gotango_v2],
    ['hamptons', peers[1]._gotango_v2],
  ]);

  assert.equal(v2BadgeLabel(nantucketV2.confirmed_category), 'HEATING UP');
  assert.notEqual(v2BadgeLabel(nantucketV2.confirmed_category), 'COOLING');
  assert.notEqual(v2BadgeLabel(nantucketV2.confirmed_category), 'RISING');
  assert.equal(modalUsesGoTangoV2Score(dest, peers, v2Map), true);
  assert.equal(buildGoTangoSignalRead(nantucketV2), 'Private arrivals are building.');
});

test('Tulum pending-exit Now eligibility', () => {
  const tulumV2 = {
    confirmed_category: 'cooling',
    data_confidence: 'high',
    truncation_status: 'complete',
    activity_baseline_7d: 18,
    activity_3d: 14,
    now_cooling_eligible: false,
    pending_exit: true,
    contrary_days: 1,
    candidate_direction: 'strengthening',
  };
  assert.equal(isNowCoolingDisplayEligible(tulumV2), true);
  assert.equal(
    buildGoTangoSignalRead(tulumV2),
    'Cooling has slowed, and activity picked up today.',
  );
  assert.ok(!/1 day strengthening/i.test(buildGoTangoSignalRead(tulumV2)));
});

test('Puerto Vallarta in-season easing read', () => {
  const pvV2 = {
    confirmed_category: 'in_season',
    candidate_direction: 'easing',
    go_tango_score_version: GOTANGO_SCORE_V2_VERSION,
    score_model: GOTANGO_SCORE_V2_MODEL,
    score_band: 'meaningful_activity',
    go_tango_score: 64,
    go_tango_score_points_7d: [60, 61, 62, 63, 64, 64, 64],
  };
  assert.equal(v2BadgeLabel(pvV2.confirmed_category), 'IN SEASON');
  assert.equal(buildGoTangoSignalRead(pvV2), 'Still active after a softer day.');
});

test('modal uses one score version atomically', () => {
  const dest = {
    id: 'alpha',
    peers: ['beta'],
    _gotango_v2: {
      go_tango_score_version: GOTANGO_SCORE_V2_VERSION,
      score_model: GOTANGO_SCORE_V2_MODEL,
      score_band: 'meaningful_activity',
      go_tango_score: 70,
      confirmed_category: 'heating_up',
      go_tango_score_points_7d: [60, 62, 64, 66, 68, 69, 70],
    },
  };
  const peersMissingV2 = [{ id: 'beta', signal_score: 40 }];
  const v2Map = new Map([['alpha', dest._gotango_v2]]);
  assert.equal(modalUsesGoTangoV2Score(dest, peersMissingV2, v2Map), false);

  const peersWithV2 = [{
    id: 'beta',
    _gotango_v2: {
      go_tango_score_version: GOTANGO_SCORE_V2_VERSION,
      score_model: GOTANGO_SCORE_V2_MODEL,
      score_band: 'moderate_or_developing',
      go_tango_score: 40,
      confirmed_category: 'steady',
      go_tango_score_points_7d: [38, 39, 40, 40, 40, 40, 40],
    },
  }];
  v2Map.set('beta', peersWithV2[0]._gotango_v2);
  assert.equal(modalUsesGoTangoV2Score(dest, peersWithV2, v2Map), true);
});

test('heating pending-exit first contrary day remains Now-eligible', () => {
  const v2 = {
    confirmed_category: 'heating_up',
    data_confidence: 'high',
    truncation_status: 'complete',
    activity_3d: 12,
    now_heating_eligible: false,
    pending_exit: true,
    contrary_days: 1,
    candidate_direction: 'easing',
  };
  assert.equal(isNowHeatingDisplayEligible(v2), true);
  assert.equal(buildGoTangoSignalRead(v2), 'The recent rise in arrivals has slowed slightly today.');
});

test('index.html contains v2.1 preview client wiring', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /gotango_score_v2_1_activity_led/);
  assert.match(html, /B_ORIGINAL_cap_15/);
  assert.match(html, /NOW_MIN_PUBLIC_SCORE = 60/);
  assert.match(html, /function goTangoScoreBand\(/);
  assert.match(html, /function buildGoTangoSignalRead\(/);
  assert.match(html, /function _modalUsesGoTangoV2Score\(/);
  assert.match(html, /function _buildNowCoolingShortlist\(/);
  assert.match(html, /label: 'HEATING UP'/);
  assert.match(html, /GOTANGO SCORE/);
  assert.match(html, /Cooling has slowed, and activity picked up today\./);
  assert.match(html, /card-signal-line/);
  assert.match(html, /destination-info/);
  assert.match(html, /grid-template-columns: auto minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(html, /day\$\{streak === 1 \? '' : 's'\} strengthening/);
});

test('Now cards use compact destination-info signal line without SIGNAL READ heading', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /function _buildNowCardCompactSignal\(/);
  assert.match(html, /className = 'card-signal-line'/);
  assert.match(html, /reasonEl\.className = v2Copy \? 'card-signal-line' : 'mover-reason'/);
  assert.match(html, /main\.className = 'dest-main destination-info'/);
  assert.match(html, /The recent rise in arrivals has slowed slightly today\./);
  assert.doesNotMatch(html, /now-card-signal-read/);
  assert.doesNotMatch(html, /dest-card--has-signal/);
  assert.doesNotMatch(html, /cooling-card--has-signal/);
  assert.doesNotMatch(html, /label\.textContent = 'Signal read'/);
  assert.match(html, /dest-modal[\s\S]*signal-read__label/);
  assert.doesNotMatch(html, /New arrivals are building from a modest base\./);
  assert.match(html, /Arrivals are picking up after a quieter stretch\./);
  assert.equal(
    buildGoTangoSignalRead({
      confirmed_category: 'heating_up',
      candidate_direction: 'strengthening',
      activity_ratio: 0.9,
      activity_baseline_7d: 5,
      pending_exit: false,
      contrary_days: 0,
    }),
    'Arrivals are picking up after a quieter stretch.',
  );
  assert.equal(
    buildGoTangoSignalRead({
      confirmed_category: 'cooling',
      pending_exit: true,
      contrary_days: 1,
      candidate_direction: 'strengthening',
    }),
    'Cooling has slowed, and activity picked up today.',
  );
});

test('Now and Movers share card-signal-line typography for v2 reads', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const cardSignalBlock = html.match(/\.card-signal-line\s*\{[\s\S]*?\}/);
  assert.ok(cardSignalBlock, 'shared card-signal-line rule exists');
  assert.match(cardSignalBlock[0], /font-size:\s*var\(--fs-label\)/);
  assert.match(cardSignalBlock[0], /color:\s*var\(--text-dim\)/);
  assert.match(cardSignalBlock[0], /line-height:\s*1\.35/);
  assert.match(cardSignalBlock[0], /font-style:\s*italic/);
  assert.doesNotMatch(html, /now-card-signal-line/);
  assert.match(html, /function _buildNowCardCompactSignal\(/);
  assert.match(html, /v2Copy \? 'card-signal-line' : 'mover-reason'/);
});

test('low-activity heating copy uses natural phrasing without analytical terms', () => {
  const modestBaseV2 = {
    confirmed_category: 'heating_up',
    candidate_direction: 'strengthening',
    activity_ratio: 0.9,
    activity_baseline_7d: 5,
    pending_exit: false,
    contrary_days: 0,
  };
  const read = buildGoTangoSignalRead(modestBaseV2);
  assert.equal(read, 'Arrivals are picking up after a quieter stretch.');
  assert.ok(!/modest base|moderate base|baseline|signal depth|momentum threshold|low-volume normalization/i.test(read));
  assert.equal(
    buildGoTangoSignalRead({
      confirmed_category: 'heating_up',
      pending_exit: true,
      contrary_days: 1,
      candidate_direction: 'easing',
    }),
    'The recent rise in arrivals has slowed slightly today.',
  );
  assert.equal(
    buildGoTangoSignalRead({
      confirmed_category: 'cooling',
      pending_exit: true,
      contrary_days: 1,
      candidate_direction: 'strengthening',
    }),
    'Cooling has slowed, and activity picked up today.',
  );
  assert.equal(
    buildGoTangoSignalRead({
      confirmed_category: 'in_season',
      candidate_direction: 'easing',
    }),
    'Still active after a softer day.',
  );
});

test('Now minimum public score 60 filters low-score cooling cards', () => {
  const destinations = [
    {
      id: 'tulum',
      name: 'Tulum & Cancún',
      _gotango_v2: {
        confirmed_category: 'cooling',
        data_confidence: 'high',
        truncation_status: 'complete',
        activity_baseline_7d: 18,
        activity_3d: 14,
        now_cooling_eligible: true,
        pending_exit: false,
        contrary_days: 0,
        go_tango_score: 70,
        go_tango_score_version: GOTANGO_SCORE_V2_VERSION,
        score_model: GOTANGO_SCORE_V2_MODEL,
        score_band: 'meaningful_activity',
        go_tango_score_points_7d: [60, 62, 64, 66, 68, 69, 70],
      },
    },
    {
      id: 'quiet-cool',
      name: 'Quiet Cool',
      _gotango_v2: {
        confirmed_category: 'cooling',
        data_confidence: 'high',
        truncation_status: 'complete',
        activity_baseline_7d: 12,
        activity_3d: 8,
        now_cooling_eligible: true,
        pending_exit: false,
        contrary_days: 0,
        go_tango_score: 55,
        go_tango_score_version: GOTANGO_SCORE_V2_VERSION,
        score_model: GOTANGO_SCORE_V2_MODEL,
        score_band: 'moderate_or_developing',
        go_tango_score_points_7d: [50, 51, 52, 53, 54, 55, 55],
      },
    },
  ];
  const cooling = buildNowCoolingShortlist(destinations);
  assert.equal(cooling.length, 1);
  assert.equal(cooling[0].id, 'tulum');
});

test('client score band boundaries are gap-free', () => {
  assert.equal(goTangoScoreBand(74.14), 'meaningful_activity');
  assert.equal(goTangoScoreBand(74.99), 'meaningful_activity');
  assert.equal(goTangoScoreBand(89.99), 'strong_and_highly_relevant');
  assert.equal(goTangoScoreBand(19.99), 'very_limited');
});
