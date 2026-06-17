import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = join(__dirname, '../index.html');

const GOTANGO_SCORE_V2_VERSION = 'gotango_score_v2';

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
      return 'The recent rise is pausing today.';
    }
    if (dir === 'strengthening') {
      return isModestBase
        ? 'New arrivals are building from a modest base.'
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
  if (!Number.isFinite(Number(v2.go_tango_score))) return false;
  if (!v2.confirmed_category) return false;
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
  assert.equal(buildGoTangoSignalRead(v2), 'The recent rise is pausing today.');
});

test('index.html contains v2 preview client wiring', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /function buildGoTangoSignalRead\(/);
  assert.match(html, /function _modalUsesGoTangoV2Score\(/);
  assert.match(html, /function _buildNowCoolingShortlist\(/);
  assert.match(html, /label: 'HEATING UP'/);
  assert.match(html, /GOTANGO SCORE/);
  assert.match(html, /Cooling has slowed, and activity picked up today\./);
  assert.doesNotMatch(html, /day\$\{streak === 1 \? '' : 's'\} strengthening/);
});
