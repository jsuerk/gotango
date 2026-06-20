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
      return 'Arrivals slowed today but still signal heating up.';
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

function v2InternalGoTangoScore(v2) {
  const internal = Number(v2.go_tango_score_internal);
  if (Number.isFinite(internal)) return internal;
  return Number(v2.go_tango_score ?? 0);
}

function destWeightedPrivateSignal24h(dest, v2) {
  const n = Number(
    dest.weighted_private_signal_24h ??
      dest.qualified_private_arrivals_24h ??
      v2.weighted_private_signal_24h ??
      v2.qualified_private_arrivals_24h,
  );
  return Number.isFinite(n) ? n : 0;
}

function sortNowHeatingShortlist(a, b) {
  const aV2 = a._gotango_v2 || a;
  const bV2 = b._gotango_v2 || b;
  const scoreDiff = v2InternalGoTangoScore(bV2) - v2InternalGoTangoScore(aV2);
  if (scoreDiff !== 0) return scoreDiff;
  const activeDiff =
    (bV2.now_heating_eligible === true ? 1 : 0) -
    (aV2.now_heating_eligible === true ? 1 : 0);
  if (activeDiff !== 0) return activeDiff;
  const a3Diff = (bV2.activity_3d ?? 0) - (aV2.activity_3d ?? 0);
  if (a3Diff !== 0) return a3Diff;
  const signalDiff =
    destWeightedPrivateSignal24h(b, bV2) - destWeightedPrivateSignal24h(a, aV2);
  if (signalDiff !== 0) return signalDiff;
  return String(aV2.name || a.name || '').localeCompare(
    String(bV2.name || b.name || ''),
    undefined,
    { sensitivity: 'base' },
  );
}

function sortNowCoolingShortlist(a, b) {
  const aV2 = a._gotango_v2 || a;
  const bV2 = b._gotango_v2 || b;
  const scoreDiff = v2InternalGoTangoScore(bV2) - v2InternalGoTangoScore(aV2);
  if (scoreDiff !== 0) return scoreDiff;
  const activeDiff =
    (bV2.now_cooling_eligible === true ? 1 : 0) -
    (aV2.now_cooling_eligible === true ? 1 : 0);
  if (activeDiff !== 0) return activeDiff;
  const a3Diff = (bV2.activity_3d ?? 0) - (aV2.activity_3d ?? 0);
  if (a3Diff !== 0) return a3Diff;
  const signalDiff =
    destWeightedPrivateSignal24h(b, bV2) - destWeightedPrivateSignal24h(a, aV2);
  if (signalDiff !== 0) return signalDiff;
  return String(aV2.name || a.name || '').localeCompare(
    String(bV2.name || b.name || ''),
    undefined,
    { sensitivity: 'base' },
  );
}

function buildNowHeatingShortlist(destinations) {
  const eligible = destinations.filter((d) => {
    const v2 = d && d._gotango_v2;
    return v2 && isNowHeatingDisplayEligible(v2) && passesNowMinimumPublicScore(v2);
  });
  eligible.sort(sortNowHeatingShortlist);
  return eligible.slice(0, 6);
}

function buildNowCoolingShortlist(destinations) {
  const eligible = destinations.filter((d) => {
    const v2 = d && d._gotango_v2;
    return v2 && isNowCoolingDisplayEligible(v2) && passesNowMinimumPublicScore(v2);
  });
  eligible.sort(sortNowCoolingShortlist);
  return eligible.slice(0, 3);
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

function getPublicSignalBadgeV2(dest) {
  const category = dest && dest.confirmed_category;
  const vibeClass =
    category === 'heating_up' ? 'surge'
      : category === 'cooling' ? 'cool'
        : 'steady';
  return { vibeClass };
}

function _normalizeLiveMapStatusToken(raw) {
  if (raw == null || raw === '') return '';
  return String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function _getLiveMapVisualType(dest, goTangoScoreV2Active = true) {
  if (!dest) return 'steady';

  if (goTangoScoreV2Active && dest.confirmed_category) {
    return getPublicSignalBadgeV2(dest).vibeClass;
  }

  const tokens = [
    dest.status,
    dest.v2_status,
    dest.score_v2_status,
    dest.category,
    dest.mover_category,
    dest.badge,
    dest.badgeKey,
    dest.status_label,
  ].map(_normalizeLiveMapStatusToken).filter(Boolean);

  const heating = new Set(['heating', 'warming', 'heating_up', 'rising', 'surge', 'surging']);
  const cooling = new Set(['cooling', 'softening', 'cooling_down', 'cool', 'off_season']);
  const steady = new Set(['in_season', 'active', 'steady', 'established', 'holding', 'busy', 'normal']);

  for (const t of tokens) {
    if (heating.has(t)) return 'surge';
    if (cooling.has(t)) return 'cool';
    if (steady.has(t)) return 'steady';
  }

  return 'steady';
}

function enrichDestinationsWithGoTangoScoreV2(destinations, v2Map) {
  return destinations.map((dest) => {
    const v2 = v2Map.get(dest.id);
    if (!v2) return dest;
    return {
      ...dest,
      confirmed_category: v2.confirmed_category,
      go_tango_score: v2.go_tango_score,
      _gotango_v2: v2,
    };
  });
}

function getArrivalsPayload(data) {
  if (!data) return null;
  if (data.data && Array.isArray(data.data.destinations)) return data.data;
  if (Array.isArray(data.destinations)) return data;
  return null;
}

function _buildLiveMapPublicDestinationMap(arrivalsData, v2Map) {
  const payload = getArrivalsPayload(arrivalsData);
  if (!payload || !Array.isArray(payload.destinations)) return null;
  const okDests = payload.destinations.filter((d) => d && d.ok === true);
  const enriched = enrichDestinationsWithGoTangoScoreV2(okDests, v2Map);
  const map = new Map();
  for (const dest of enriched) {
    if (!dest || !dest.id) continue;
    if (v2Map && v2Map.size > 0 && !dest._gotango_v2) continue;
    map.set(dest.id, dest);
  }
  return map;
}

function _getPublicDestinationForLiveMap(rawDest, publicDestMap) {
  const id = rawDest && rawDest.id;
  if (!id) return rawDest;
  const enriched = publicDestMap && publicDestMap.get(id);
  if (enriched) return { ...rawDest, ...enriched };
  if (publicDestMap) {
    const normName = _normalizeLiveMapDestinationName(rawDest.name || rawDest.label || rawDest.title);
    if (normName) {
      for (const publicDest of publicDestMap.values()) {
        if (_normalizeLiveMapDestinationName(publicDest.name) === normName) {
          return { ...rawDest, ...publicDest };
        }
      }
    }
  }
  return rawDest;
}

function _normalizeLiveMapDestinationName(name) {
  if (name == null || name === '') return '';
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function _resolveLiveMapPublicId(dest, publicDestMap) {
  if (!dest) return '';
  if (dest._gotango_v2 && dest._gotango_v2.id) return String(dest._gotango_v2.id);
  if (dest.id && publicDestMap && publicDestMap.has(dest.id)) return String(dest.id);
  if (publicDestMap) {
    const normName = _normalizeLiveMapDestinationName(dest.name || dest.label || dest.title);
    if (normName) {
      for (const publicDest of publicDestMap.values()) {
        if (_normalizeLiveMapDestinationName(publicDest.name) === normName) {
          return String(publicDest.id);
        }
      }
    }
  }
  return dest.id ? String(dest.id) : '';
}

function _getLiveMapCanonicalDestinationKey(dest, publicDestMap) {
  if (!dest) return '';
  const publicId = _resolveLiveMapPublicId(dest, publicDestMap);
  if (publicId) return `id:${publicId}`;
  if (dest.slug) return `slug:${String(dest.slug)}`;
  const normName = _normalizeLiveMapDestinationName(dest.name || dest.label || dest.title);
  if (normName) return `name:${normName}`;
  return '';
}

function _integerArrivals24h(dest) {
  if (!dest) return 0;
  const n = Number(dest.arrivals_count ?? dest.private_arrivals_24h ?? dest.raw_ga_arrivals_24h);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function _hasValidLiveMapCoords(dest) {
  return dest && typeof dest.lat === 'number' && typeof dest.lng === 'number';
}

function _pickLiveMapCoords(enrichedDest, rawDest) {
  if (_hasValidLiveMapCoords(enrichedDest)) {
    return { lat: enrichedDest.lat, lng: enrichedDest.lng };
  }
  if (_hasValidLiveMapCoords(rawDest)) {
    return { lat: rawDest.lat, lng: rawDest.lng };
  }
  return null;
}

function _resolveLiveMapMarkerArrivalsCount(publicDest, rawArrivals) {
  if (
    publicDest &&
    (publicDest.arrivals_count != null ||
      publicDest.private_arrivals_24h != null ||
      publicDest.raw_ga_arrivals_24h != null)
  ) {
    return _integerArrivals24h(publicDest);
  }
  let max = 0;
  for (const raw of rawArrivals) {
    max = Math.max(max, _integerArrivals24h(raw));
  }
  return max;
}

function _createLiveMapCanonicalEntry(rawDest, publicDest) {
  const coords = _pickLiveMapCoords(publicDest, rawDest);
  if (!coords) return null;
  const id = publicDest.id || rawDest.id;
  const name = publicDest.name || publicDest.label || publicDest.title ||
    rawDest.name || rawDest.label || rawDest.title || id;
  return {
    publicDest,
    rawArrivals: [rawDest],
    id,
    name,
    lat: coords.lat,
    lng: coords.lng,
  };
}

function _mergeLiveMapCanonicalEntry(existing, rawDest, publicDest) {
  const mergedPublic = { ...existing.publicDest, ...rawDest, ...publicDest };
  const rawArrivals = existing.rawArrivals.concat(rawDest);
  const coords = _pickLiveMapCoords(mergedPublic, rawDest) || {
    lat: existing.lat,
    lng: existing.lng,
  };
  const id = mergedPublic.id || existing.id || rawDest.id;
  const name = mergedPublic.name || mergedPublic.label || mergedPublic.title ||
    existing.name || rawDest.name || rawDest.label || rawDest.title || id;
  return {
    publicDest: mergedPublic,
    rawArrivals,
    id,
    name,
    lat: coords.lat,
    lng: coords.lng,
  };
}

function resolveWorldMapDestinationsForTest(arrivalsData, v2Map) {
  const allDests = arrivalsData && arrivalsData.data && Array.isArray(arrivalsData.data.destinations)
    ? arrivalsData.data.destinations
    : null;
  if (!allDests || allDests.length === 0) return [];
  const publicDestMap = _buildLiveMapPublicDestinationMap(arrivalsData, v2Map);
  const validDests = allDests
    .filter((dest) => _hasValidLiveMapCoords(dest))
    .sort((a, b) => Number(b.signal_score || 0) - Number(a.signal_score || 0));
  const byCanonical = new Map();
  for (const dest of validDests) {
    const publicDest = _getPublicDestinationForLiveMap(dest, publicDestMap);
    const key = _getLiveMapCanonicalDestinationKey(publicDest, publicDestMap);
    if (!key) continue;
    const existing = byCanonical.get(key);
    byCanonical.set(
      key,
      existing
        ? _mergeLiveMapCanonicalEntry(existing, dest, publicDest)
        : _createLiveMapCanonicalEntry(dest, publicDest),
    );
  }
  return Array.from(byCanonical.values())
    .filter(Boolean)
    .map((entry) => {
      const arrivalsCount = _resolveLiveMapMarkerArrivalsCount(entry.publicDest, entry.rawArrivals);
      const type = _getLiveMapVisualType(entry.publicDest, true);
      const size = arrivalsCount <= 0 ? 2 : Math.max(2, Math.min(8, 2 + (arrivalsCount / 5)));
      return {
        id: entry.id,
        name: entry.name,
        lng: entry.lng,
        lat: entry.lat,
        type,
        size,
      };
    });
}

function resolveLiveMapTypeForRawDest(rawDest, arrivalsData, v2Map) {
  const publicDestMap = _buildLiveMapPublicDestinationMap(arrivalsData, v2Map);
  const publicDest = _getPublicDestinationForLiveMap(rawDest, publicDestMap);
  return _getLiveMapVisualType(publicDest, true);
}

/** Mirrors index.html expanded Live Map nearest-marker selection. */
function _getExpandedMapSelectionRadius(isMobile) {
  return isMobile ? 20 : 14;
}

function _getExpandedMapWorldWrapWidth(width) {
  return width;
}

function _getExpandedMapWrapOffsets(worldWrapWidth) {
  return [
    -3 * worldWrapWidth,
    -2 * worldWrapWidth,
    -worldWrapWidth,
    0,
    worldWrapWidth,
    2 * worldWrapWidth,
    3 * worldWrapWidth
  ];
}

function _buildExpandedMapMarkerRecords(baseMarkers, worldWrapWidth) {
  if (!Array.isArray(baseMarkers) || baseMarkers.length === 0) return [];
  const offsets = _getExpandedMapWrapOffsets(worldWrapWidth);
  const records = [];
  for (const marker of baseMarkers) {
    for (const wrapOffset of offsets) {
      records.push({
        id: marker.id,
        name: marker.name,
        type: marker.type,
        x: marker.x + wrapOffset,
        y: marker.y,
        wrapOffset,
      });
    }
  }
  return records;
}

function _dedupeExpandedMapCandidatesById(candidates) {
  const deduped = [];
  const seen = new Set();
  for (const entry of candidates) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    deduped.push(entry);
  }
  return deduped;
}

function _getExpandedMapInitialTransformForTest(projection, width, height, isMobile) {
  const initialK = isMobile ? 1.08 : 1.12;
  const [targetX, targetY] = projection([-82, 17]);
  return {
    k: initialK,
    x: width / 2 - initialK * targetX,
    y: height / 2 - initialK * targetY,
    applyX: (x) => initialK * x + (width / 2 - initialK * targetX),
    applyY: (y) => initialK * y + (height / 2 - initialK * targetY),
  };
}

const _EXPANDED_MAP_AMBIGUITY_GAP_PX = 8;
const _EXPANDED_MAP_MAX_PICKER_CANDIDATES = 6;

function _pickNearestExpandedMapMarkers(pointerX, pointerY, markers, transform, isMobile) {
  if (!Array.isArray(markers) || markers.length === 0 || !transform) {
    return { mode: 'none', candidates: [] };
  }

  const selectionRadius = _getExpandedMapSelectionRadius(isMobile);
  const ranked = _dedupeExpandedMapCandidatesById(
    markers
      .map((marker) => {
        const screenX = transform.applyX(marker.x);
        const screenY = transform.applyY(marker.y);
        const distance = Math.hypot(pointerX - screenX, pointerY - screenY);
        return { ...marker, screenX, screenY, distance };
      })
      .filter((entry) => entry.distance <= selectionRadius)
      .sort((a, b) => a.distance - b.distance)
  ).slice(0, _EXPANDED_MAP_MAX_PICKER_CANDIDATES);

  if (ranked.length === 0) {
    return { mode: 'none', candidates: [] };
  }
  if (ranked.length === 1) {
    return { mode: 'single', destinationId: ranked[0].id, candidates: ranked };
  }
  if (ranked[1].distance - ranked[0].distance < _EXPANDED_MAP_AMBIGUITY_GAP_PX) {
    return { mode: 'ambiguous', candidates: ranked };
  }
  return { mode: 'single', destinationId: ranked[0].id, candidates: ranked };
}

function createIdentityTransform() {
  return {
    applyX: (x) => x,
    applyY: (y) => y,
  };
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
  assert.equal(buildGoTangoSignalRead(v2), 'Arrivals slowed today but still signal heating up.');
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
  assert.match(html, /grid-template-columns: auto minmax\(0, 1fr\) min-content/);
  assert.doesNotMatch(html, /day\$\{streak === 1 \? '' : 's'\} strengthening/);
});

test('Now cards use compact destination-info signal line without SIGNAL READ heading', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /function _buildNowCardCompactSignal\(/);
  assert.match(html, /className = 'card-signal-line'/);
  assert.match(html, /reasonEl\.className = v2Copy \? 'card-signal-line' : 'mover-reason'/);
  assert.match(html, /main\.className = 'dest-main destination-info'/);
  assert.match(html, /Arrivals slowed today but still signal heating up\./);
  assert.doesNotMatch(html, /The recent rise in arrivals has slowed slightly today but still shows signs of heating up\./);
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
    'Arrivals slowed today but still signal heating up.',
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

const HEATING_UP_PENDING_EXIT_COPY =
  'Arrivals slowed today but still signal heating up.';
const HEATING_UP_PENDING_EXIT_COPY_PREVIOUS =
  'The recent rise in arrivals has slowed slightly today but still shows signs of heating up.';

function makeHeatingDest({
  id,
  name,
  internal,
  publicScore,
  nowHeatingEligible = false,
  pendingExit = false,
  contraryDays = 0,
  direction = 'easing',
  activity3d = 10,
  weightedSignal = 5,
}) {
  return {
    id,
    name,
    weighted_private_signal_24h: weightedSignal,
    _gotango_v2: {
      name,
      confirmed_category: 'heating_up',
      data_confidence: 'high',
      truncation_status: 'complete',
      activity_3d: activity3d,
      go_tango_score_internal: internal,
      go_tango_score: publicScore,
      go_tango_score_version: GOTANGO_SCORE_V2_VERSION,
      score_model: GOTANGO_SCORE_V2_MODEL,
      score_band: 'meaningful_activity',
      go_tango_score_points_7d: [60, 62, 64, 66, 68, 69, publicScore],
      now_heating_eligible: nowHeatingEligible,
      pending_exit: pendingExit,
      contrary_days: contraryDays,
      candidate_direction: direction,
    },
  };
}

test('Now Heating Up sorts by internal GoTango Score descending', () => {
  const destinations = [
    makeHeatingDest({
      id: 'santa-fe',
      name: 'Santa Fe',
      internal: 68.76,
      publicScore: 69,
      nowHeatingEligible: true,
      direction: 'strengthening',
      activity3d: 17.6,
      weightedSignal: 18.5,
    }),
    makeHeatingDest({
      id: 'hamptons',
      name: 'Hamptons',
      internal: 99.89,
      publicScore: 100,
      pendingExit: true,
      contraryDays: 1,
      activity3d: 75.15,
      weightedSignal: 55,
    }),
    makeHeatingDest({
      id: 'nantucket',
      name: 'Nantucket',
      internal: 93.29,
      publicScore: 93,
      pendingExit: true,
      contraryDays: 1,
      activity3d: 49.9,
      weightedSignal: 43.8,
    }),
    makeHeatingDest({
      id: 'mallorca',
      name: 'Mallorca',
      internal: 74.14,
      publicScore: 74,
      pendingExit: true,
      contraryDays: 1,
      activity3d: 25.05,
      weightedSignal: 24,
    }),
    makeHeatingDest({
      id: 'destin-30a',
      name: 'Destin / 30A',
      internal: 72.74,
      publicScore: 73,
      pendingExit: true,
      contraryDays: 1,
      activity3d: 23,
      weightedSignal: 17,
    }),
  ];

  const ordered = buildNowHeatingShortlist(destinations);
  assert.deepEqual(
    ordered.map((d) => d.id),
    ['hamptons', 'nantucket', 'mallorca', 'destin-30a', 'santa-fe'],
  );
  assert.ok(
    ordered.findIndex((d) => d.id === 'hamptons') <
      ordered.findIndex((d) => d.id === 'nantucket'),
  );
  assert.ok(
    ordered.findIndex((d) => d.id === 'nantucket') <
      ordered.findIndex((d) => d.id === 'santa-fe'),
  );
});

test('active versus pending-exit is only a tie-breaker on equal internal score', () => {
  const active = makeHeatingDest({
    id: 'active-low',
    name: 'Active Low',
    internal: 70,
    publicScore: 70,
    nowHeatingEligible: true,
    direction: 'strengthening',
    activity3d: 20,
    weightedSignal: 10,
  });
  const pendingHigh = makeHeatingDest({
    id: 'pending-high',
    name: 'Pending High',
    internal: 85,
    publicScore: 85,
    pendingExit: true,
    contraryDays: 1,
    activity3d: 5,
    weightedSignal: 1,
  });
  const ordered = buildNowHeatingShortlist([active, pendingHigh]);
  assert.deepEqual(ordered.map((d) => d.id), ['pending-high', 'active-low']);

  const tiedActive = makeHeatingDest({
    id: 'alpha-active',
    name: 'Alpha',
    internal: 80,
    publicScore: 80,
    nowHeatingEligible: true,
    direction: 'strengthening',
    activity3d: 12,
    weightedSignal: 8,
  });
  const tiedPending = makeHeatingDest({
    id: 'beta-pending',
    name: 'Beta',
    internal: 80,
    publicScore: 80,
    pendingExit: true,
    contraryDays: 1,
    activity3d: 12,
    weightedSignal: 8,
  });
  const tiedOrder = buildNowHeatingShortlist([tiedPending, tiedActive]);
  assert.deepEqual(tiedOrder.map((d) => d.id), ['alpha-active', 'beta-pending']);
});

test('internal decimal score beats rounded public integer for Now ordering', () => {
  const higherInternal = makeHeatingDest({
    id: 'decimal-winner',
    name: 'Decimal Winner',
    internal: 74.99,
    publicScore: 75,
    nowHeatingEligible: true,
    direction: 'strengthening',
    activity3d: 10,
    weightedSignal: 5,
  });
  const lowerInternal = makeHeatingDest({
    id: 'decimal-loser',
    name: 'Decimal Loser',
    internal: 74.14,
    publicScore: 75,
    pendingExit: true,
    contraryDays: 1,
    activity3d: 30,
    weightedSignal: 20,
  });
  const ordered = buildNowHeatingShortlist([lowerInternal, higherInternal]);
  assert.deepEqual(ordered.map((d) => d.id), ['decimal-winner', 'decimal-loser']);
});

test('Now Cooling Watch sorts by internal GoTango Score descending', () => {
  const destinations = [
    {
      id: 'cool-high',
      name: 'Cool High',
      weighted_private_signal_24h: 20,
      _gotango_v2: {
        name: 'Cool High',
        confirmed_category: 'cooling',
        data_confidence: 'high',
        truncation_status: 'complete',
        activity_baseline_7d: 18,
        activity_3d: 14,
        go_tango_score_internal: 69.94,
        go_tango_score: 70,
        now_cooling_eligible: false,
        pending_exit: true,
        contrary_days: 1,
        candidate_direction: 'strengthening',
      },
    },
    {
      id: 'cool-low',
      name: 'Cool Low',
      weighted_private_signal_24h: 30,
      _gotango_v2: {
        name: 'Cool Low',
        confirmed_category: 'cooling',
        data_confidence: 'high',
        truncation_status: 'complete',
        activity_baseline_7d: 20,
        activity_3d: 8,
        go_tango_score_internal: 62,
        go_tango_score: 62,
        now_cooling_eligible: true,
        pending_exit: false,
        contrary_days: 0,
        candidate_direction: 'easing',
      },
    },
  ];
  const ordered = buildNowCoolingShortlist(destinations);
  assert.deepEqual(ordered.map((d) => d.id), ['cool-high', 'cool-low']);
});

test('Now shortlist limits and minimum score remain unchanged', () => {
  const manyHeating = Array.from({ length: 8 }, (_, i) =>
    makeHeatingDest({
      id: `heat-${i}`,
      name: `Heat ${i}`,
      internal: 90 - i,
      publicScore: 90 - i,
      nowHeatingEligible: true,
      direction: 'strengthening',
      activity3d: 10 + i,
      weightedSignal: 5,
    }),
  );
  assert.equal(buildNowHeatingShortlist(manyHeating).length, 6);

  const belowMin = makeHeatingDest({
    id: 'below-min',
    name: 'Below Min',
    internal: 55,
    publicScore: 55,
    nowHeatingEligible: true,
    direction: 'strengthening',
  });
  const aboveMin = makeHeatingDest({
    id: 'above-min',
    name: 'Above Min',
    internal: 65,
    publicScore: 65,
    nowHeatingEligible: true,
    direction: 'strengthening',
  });
  const heating = buildNowHeatingShortlist([belowMin, aboveMin]);
  assert.equal(heating.length, 1);
  assert.equal(heating[0].id, 'above-min');

  const coolingMany = Array.from({ length: 5 }, (_, i) => ({
    id: `cool-${i}`,
    name: `Cool ${i}`,
    weighted_private_signal_24h: 10,
    _gotango_v2: {
      name: `Cool ${i}`,
      confirmed_category: 'cooling',
      data_confidence: 'high',
      truncation_status: 'complete',
      activity_baseline_7d: 12,
      activity_3d: 8,
      go_tango_score_internal: 80 - i,
      go_tango_score: 80 - i,
      now_cooling_eligible: true,
      pending_exit: false,
      contrary_days: 0,
      candidate_direction: 'easing',
    },
  }));
  assert.equal(buildNowCoolingShortlist(coolingMany).length, 3);
});

test('Heating Up pending-exit day 1 wording is consistent across surfaces', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const pendingExitV2 = {
    confirmed_category: 'heating_up',
    pending_exit: true,
    contrary_days: 1,
    candidate_direction: 'easing',
  };
  assert.equal(buildGoTangoSignalRead(pendingExitV2), HEATING_UP_PENDING_EXIT_COPY);
  assert.match(html, new RegExp(HEATING_UP_PENDING_EXIT_COPY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(
    html,
    new RegExp(HEATING_UP_PENDING_EXIT_COPY_PREVIOUS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
  assert.match(html, /function _buildNowCardCompactSignal\(/);
  assert.match(html, /function getMoverReason\(/);
  assert.match(html, /function renderSignalReadBlock\(/);
  assert.match(html, /useV2[\s\S]*buildGoTangoSignalRead\(dest && dest\._gotango_v2\)/);
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

test('Now card signal line uses destination-info width bleed without copy changes', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /grid-template-columns: auto minmax\(0, 1fr\) min-content/);
  assert.match(html, /#tab-now \.card-signal-line[\s\S]*?margin-right: calc\(-10px - 5\.75rem\)/);
  assert.match(html, /#tab-now \.dest-score-main[\s\S]*?min-width: 0/);
  assert.match(html, /main\.className = 'dest-main destination-info'/);
  assert.match(html, /className = 'card-signal-line'/);
  assert.doesNotMatch(html, /now-card-signal-read/);
  assert.equal(
    buildGoTangoSignalRead({
      confirmed_category: 'heating_up',
      pending_exit: true,
      contrary_days: 1,
      candidate_direction: 'easing',
    }),
    'Arrivals slowed today but still signal heating up.',
  );
});

test('Movers action controls keep handlers and hit area while removing visible circles', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const moversBtnBlock = html.match(/#tab-movers \.mover-action-btn-circle\s*\{[\s\S]*?\}/);
  assert.ok(moversBtnBlock, 'Movers action button rule exists');
  assert.match(moversBtnBlock[0], /width: 34px/);
  assert.match(moversBtnBlock[0], /height: 34px/);
  assert.match(moversBtnBlock[0], /min-width: 34px/);
  assert.match(moversBtnBlock[0], /min-height: 34px/);
  assert.match(moversBtnBlock[0], /border: none/);
  assert.match(moversBtnBlock[0], /background: transparent/);
  assert.match(moversBtnBlock[0], /box-shadow: none/);
  assert.doesNotMatch(moversBtnBlock[0], /border-radius: 50%/);
  const watchIconBlock = html.match(/#tab-movers \.mover-action-btn-circle__icon\s*\{[\s\S]*?\}/);
  assert.ok(watchIconBlock, 'Movers watch + icon rule exists');
  assert.match(watchIconBlock[0], /font-size: 22px/);
  assert.doesNotMatch(watchIconBlock[0], /font-size: 17px/);
  assert.match(html, /watchBtn\.className = 'mover-action-btn-circle mover-action-btn-circle--watch'/);
  assert.match(html, /shareBtn\.className = 'mover-action-btn-circle mover-action-btn-circle--share'/);
  assert.match(html, /data-mover-action', 'watch'/);
  assert.match(html, /data-mover-action', 'share'/);
  assert.match(html, /_applyMoverWatchButtonState\(watchBtn, destId\)/);
  assert.match(html, /shareDestinationBrief\(dest\)/);
  assert.match(html, /#tab-movers \.mover-action-btn-circle--watch\.is-watched[\s\S]*?color: var\(--signal-up\)/);
  assert.match(html, /#tab-movers \.mover-action-btn-circle:focus-visible/);
  assert.doesNotMatch(html, /#tab-watch \.mover-action-btn-circle/);
  const shareIconBlock = html.match(/#tab-movers \.mover-action-btn-circle__share-icon\s*\{[\s\S]*?\}/);
  assert.ok(shareIconBlock, 'Movers share icon rule exists');
  assert.match(shareIconBlock[0], /width: 15px/);
  assert.match(shareIconBlock[0], /height: 15px/);
});

test('Live Map dot color uses enriched public category, not raw arrivals status or rank', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /function _buildLiveMapPublicDestinationMap\(/);
  assert.match(html, /function _getPublicDestinationForLiveMap\(/);
  assert.match(html, /getPublicSignalBadgeV2\(dest\)\.vibeClass/);
  assert.match(html, /const publicDest = _getPublicDestinationForLiveMap\(dest, publicDestMap\)/);
  assert.match(html, /const type = _getLiveMapVisualType\(entry\.publicDest\)/);
  assert.match(html, /function _computeTier\(dest, allDestinations\)/);

  const v2Map = new Map([
    ['destin-30a', { id: 'destin-30a', confirmed_category: 'in_season', go_tango_score: 73 }],
    ['hamptons', { id: 'hamptons', confirmed_category: 'in_season', go_tango_score: 100 }],
    ['palm-beach', { id: 'palm-beach', confirmed_category: 'in_season', go_tango_score: 97 }],
    ['nantucket', { id: 'nantucket', confirmed_category: 'heating_up', go_tango_score: 93 }],
    ['hilton-head', { id: 'hilton-head', confirmed_category: 'cooling', go_tango_score: 55 }],
    ['sardinia-olbia', { id: 'sardinia-olbia', confirmed_category: 'cooling', go_tango_score: 48 }],
  ]);

  const arrivalsData = {
    data: {
      destinations: [
        { id: 'destin-30a', ok: true, lat: 30.4, lng: -86.5, signal_score: 95, status: 'heating' },
        { id: 'hamptons', ok: true, lat: 40.96, lng: -72.25, signal_score: 99, status: 'heating' },
        { id: 'palm-beach', ok: true, lat: 26.68, lng: -80.1, signal_score: 97, status: 'heating' },
        { id: 'nantucket', ok: true, lat: 41.28, lng: -70.1, signal_score: 93, status: 'steady' },
        { id: 'hilton-head', ok: true, lat: 32.2, lng: -80.7, signal_score: 20, status: 'heating' },
        { id: 'sardinia-olbia', ok: true, lat: 40.9, lng: 9.5, signal_score: 15, status: 'heating' },
      ],
    },
  };

  const expectations = {
    'destin-30a': 'steady',
    hamptons: 'steady',
    'palm-beach': 'steady',
    nantucket: 'surge',
    'hilton-head': 'cool',
    'sardinia-olbia': 'cool',
  };

  for (const rawDest of arrivalsData.data.destinations) {
    assert.equal(
      resolveLiveMapTypeForRawDest(rawDest, arrivalsData, v2Map),
      expectations[rawDest.id],
      `${rawDest.id} should use public category for map color`,
    );
  }

  const destinRaw = arrivalsData.data.destinations[0];
  assert.equal(_getLiveMapVisualType(destinRaw, true), 'surge', 'raw dest without enrichment would mis-color');
  const publicDest = _getPublicDestinationForLiveMap(
    destinRaw,
    _buildLiveMapPublicDestinationMap(arrivalsData, v2Map),
  );
  assert.equal(publicDest.confirmed_category, 'in_season');
  assert.equal(_getLiveMapVisualType(publicDest, true), 'steady');
});

test('Live Map dedupes duplicate raw rows to one marker per public destination', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /function _getLiveMapCanonicalDestinationKey\(/);
  assert.match(html, /const byCanonical = new Map\(\)/);

  const v2Map = new Map([
    ['jackson-hole', { id: 'jackson-hole', confirmed_category: 'cooling', go_tango_score: 42 }],
    ['destin-30a', { id: 'destin-30a', confirmed_category: 'in_season', go_tango_score: 73 }],
    ['hilton-head', { id: 'hilton-head', confirmed_category: 'cooling', go_tango_score: 55 }],
  ]);

  const arrivalsData = {
    data: {
      destinations: [
        { id: 'jackson-hole', ok: true, name: 'Jackson Hole', lat: 43.6073, lng: -110.7377, signal_score: 50, status: 'heating', arrivals_count: 8 },
        { id: 'kjac', ok: true, name: 'Jackson Hole', lat: 43.61, lng: -110.74, signal_score: 48, status: 'heating', arrivals_count: 12 },
        { id: 'destin-30a', ok: true, name: 'Destin / 30A', lat: 30.4, lng: -86.5, signal_score: 95, status: 'heating', arrivals_count: 4 },
        { id: 'destin-30a', ok: true, name: 'Destin / 30A', lat: 30.41, lng: -86.48, signal_score: 94, status: 'heating', arrivals_count: 9 },
        { id: 'hilton-head', ok: true, name: 'Hilton Head', lat: 32.2, lng: -80.7, signal_score: 20, status: 'heating', arrivals_count: 6 },
        { id: 'hilton-head', ok: true, name: 'Hilton Head', lat: 32.22, lng: -80.69, signal_score: 19, status: 'heating', arrivals_count: 10 },
      ],
    },
  };

  const markers = resolveWorldMapDestinationsForTest(arrivalsData, v2Map);
  assert.equal(markers.length, 3, 'duplicate raw rows should collapse to one marker per destination');

  const jackson = markers.find((m) => m.id === 'jackson-hole');
  assert.ok(jackson, 'Jackson Hole marker should use public destination id');
  assert.equal(jackson.type, 'cool', 'enriched public category should win over raw heating status');

  const destin = markers.find((m) => m.id === 'destin-30a');
  assert.ok(destin, 'Destin / 30A marker should remain');
  assert.equal(destin.type, 'steady', 'IN SEASON public category should stay green on the map');

  const hilton = markers.find((m) => m.id === 'hilton-head');
  assert.ok(hilton, 'Hilton Head marker should remain');
  assert.equal(hilton.type, 'cool', 'cooling public category should stay blue on the map');
});

test('expanded Live Map nearest-marker selection uses pointer distance, not topmost marker', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /function _pickNearestExpandedMapMarkers\(/);
  assert.match(html, /function _showExpandedMapDestinationPicker\(/);
  assert.match(html, /function _bindExpandedMapSelectionHandlers\(/);
  assert.doesNotMatch(
    html,
    /closest\('\[data-live-map-destination-id\]'\)[\s\S]*?openDestinationModal/,
  );

  const transform = createIdentityTransform();
  const cluster = [
    { id: 'st-barth', name: 'St. Barth', type: 'surge', x: 100, y: 80 },
    { id: 'mustique', name: 'Mustique', type: 'steady', x: 108, y: 80 },
    { id: 'anguilla', name: 'Anguilla', type: 'cool', x: 116, y: 80 },
  ];

  const ambiguous = _pickNearestExpandedMapMarkers(104, 80, cluster, transform, false);
  assert.equal(ambiguous.mode, 'ambiguous');
  assert.ok(ambiguous.candidates.length >= 2);
  assert.equal(ambiguous.candidates[0].id, 'st-barth');
  assert.equal(ambiguous.candidates[1].id, 'mustique');

  const nearest = _pickNearestExpandedMapMarkers(108, 80, cluster, transform, false);
  assert.equal(nearest.mode, 'single');
  assert.equal(nearest.destinationId, 'mustique', 'closest dot center should win over overlapping hit target');
});

test('expanded Live Map isolated marker resolves directly without picker', () => {
  const transform = createIdentityTransform();
  const markers = [
    { id: 'santa-fe', name: 'Santa Fe', type: 'steady', x: 200, y: 90 },
    { id: 'aspen', name: 'Aspen', type: 'cool', x: 260, y: 88 },
  ];

  const pick = _pickNearestExpandedMapMarkers(201, 90, markers, transform, false);
  assert.equal(pick.mode, 'single');
  assert.equal(pick.destinationId, 'santa-fe');

  const miss = _pickNearestExpandedMapMarkers(150, 90, markers, transform, false);
  assert.equal(miss.mode, 'none');
  assert.equal(miss.candidates.length, 0);
});

test('expanded Live Map wrap offsets include ±3 world widths', () => {
  const worldWrapWidth = 480;
  assert.deepEqual(
    _getExpandedMapWrapOffsets(worldWrapWidth),
    [-1440, -960, -480, 0, 480, 960, 1440]
  );
});

test('expanded Live Map wrapped marker records include x offsets for world wrap width', () => {
  const worldWrapWidth = 480;
  const base = [{ id: 'miami', name: 'Miami', type: 'surge', x: 200, y: 90 }];
  const wrapped = _buildExpandedMapMarkerRecords(base, worldWrapWidth);

  assert.equal(wrapped.length, 7);
  assert.deepEqual(wrapped.map((m) => m.x), [-1240, -760, -280, 200, 680, 1160, 1640]);
  assert.ok(wrapped.every((m) => m.id === 'miami' && m.y === 90));
});

test('expanded Live Map picker dedupes wrapped copies by destination id', () => {
  const transform = createIdentityTransform();
  const base = [{ id: 'st-barth', name: 'St. Barth', type: 'surge', x: 100, y: 80 }];
  const wrapped = _buildExpandedMapMarkerRecords(base, 480);

  const pick = _pickNearestExpandedMapMarkers(100, 80, wrapped, transform, false);
  assert.equal(pick.mode, 'single');
  assert.equal(pick.destinationId, 'st-barth');
  assert.equal(pick.candidates.length, 1, 'wrapped copies near the same tap should dedupe to one candidate');

  const nearWrapCopy = _pickNearestExpandedMapMarkers(580, 80, wrapped, transform, false);
  assert.equal(nearWrapCopy.mode, 'single');
  assert.equal(nearWrapCopy.destinationId, 'st-barth');
});

test('expanded Live Map initial transform centers Americas view', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /function _getExpandedMapInitialTransform\(/);
  assert.match(html, /projection\(\[-82, 17\]\)/);

  const width = 480;
  const height = 150;
  const scale = 76;
  const projection = {
    apply: ([lng, lat]) => [
      (lng / 360 + 0.5) * scale * (width / scale) + width / 2 - width / 2,
      height / 2 + 8 - (lat / 180) * scale,
    ],
  };
  projection.call = ([lng, lat]) => {
    const x = width / 2 + (lng / 360) * width;
    const y = height / 2 + 8 - (lat / 180) * scale * 2;
    return [x, y];
  };
  const geoLike = ([lng, lat]) => [
    width / 2 + (lng / 360) * width,
    height / 2 + 8 - (lat / 180) * scale * 2,
  ];

  const mobile = _getExpandedMapInitialTransformForTest(geoLike, width, height, true);
  assert.equal(mobile.k, 1.08);
  assert.ok(mobile.x < width / 2, 'Americas center should shift viewport west of map midpoint');
  assert.ok(mobile.y < height / 2, 'Americas center should shift viewport north of map midpoint');

  const desktop = _getExpandedMapInitialTransformForTest(geoLike, width, height, false);
  assert.equal(desktop.k, 1.12);
  assert.ok(desktop.x < width / 2);
});

function _clampExpandedMapTransformYForTest(transform, height) {
  const k = transform.k;
  const margin = height * 0.07;
  const yMin = height * (1 - k) - margin;
  const yMax = margin;
  let y = transform.y;
  if (y < yMin) y = yMin;
  else if (y > yMax) y = yMax;
  else return transform;
  return { ...transform, y };
}

test('expanded Live Map Y clamp keeps transform within scale-aware vertical bounds', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /function _clampExpandedMapTransformY\(/);

  const height = 150;
  const k = 1.08;
  const margin = height * 0.07;
  const yMin = height * (1 - k) - margin;
  const yMax = margin;

  const within = _clampExpandedMapTransformYForTest({ k, x: 100, y: 5 }, height);
  assert.equal(within.y, 5, 'in-range y should pass through unchanged');

  const tooHigh = _clampExpandedMapTransformYForTest({ k, x: 100, y: 80 }, height);
  assert.equal(tooHigh.y, yMax, 'large positive y should clamp to top margin');

  const tooLow = _clampExpandedMapTransformYForTest({ k, x: 100, y: -80 }, height);
  assert.equal(tooLow.y, yMin, 'large negative y should clamp to bottom bound');

  const zoomed = _clampExpandedMapTransformYForTest({ k: 4, x: 50, y: -200 }, height);
  assert.ok(zoomed.y >= height * (1 - 4) - margin, 'zoomed-in pan should allow wider negative y');
  assert.ok(zoomed.y <= margin, 'zoomed-in pan should still respect top margin');
});
