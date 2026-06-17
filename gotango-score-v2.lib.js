/**
 * GoTango Score v2 — pure deterministic read-time engine.
 * Ported from /tmp/gotango-travel-outlook-corrected-backtest.py (recommended model).
 */

export const GOTANGO_SCORE_VERSION = 'gotango_score_v2';
export const HISTORY_VERSION = 'ga_filtered_v2';

export const O5_WEIGHTS = [0.35, 0.25, 0.18, 0.13, 0.09];
export const ACTIVITY_3D_WEIGHTS = [0.5, 0.3, 0.2];
export const MIN_ACTIVITY = 5;
export const BASELINE_FLOOR = 5;
export const IN_SEASON_BASELINE_RATIO = 0.9;
export const MATURE_MIN_PRIOR = 3;

export const DEFAULT_PARAMS = {
  abs_deadband: 1.0,
  pct_deadband: 0.05,
  cooling_ratio: 0.8,
  in_season_variant: 'B',
};

export const CATEGORY_KEYS = ['heating_up', 'in_season', 'steady', 'cooling'];

const CATEGORY_DISPLAY = {
  heating_up: 'Heating Up',
  in_season: 'In Season',
  steady: 'Steady',
  cooling: 'Cooling',
};

const DISPLAY_TO_KEY = Object.fromEntries(
  Object.entries(CATEGORY_DISPLAY).map(([k, v]) => [v, k]),
);

export function calendarDateUtc(iso) {
  if (!iso) return null;
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

export function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function median(values) {
  if (!values || values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Linear interpolation percentile — matches corrected backtest script. */
export function percentile(values, pct) {
  if (!values || values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const k = (s.length - 1) * (pct / 100);
  const f = Math.floor(k);
  const c = Math.ceil(k);
  if (f === c) return s[Math.round(k)];
  return s[f] * (c - k) + s[c] * (k - f);
}

export function weightedOutlook(scores, weights) {
  const n = Math.min(scores.length, weights.length);
  if (n === 0) return null;
  const w = weights.slice(0, n);
  const s = scores.slice(0, n);
  const tw = w.reduce((acc, wi) => acc + wi, 0);
  if (!tw) return null;
  return s.reduce((acc, si, i) => acc + si * w[i], 0) / tw;
}

export function computeActivity3d(signals, idx) {
  if (idx < 2) return null;
  return ACTIVITY_3D_WEIGHTS.reduce(
    (acc, w, lag) => acc + signals[idx - lag] * w,
    0,
  );
}

export function truncationLabel(val) {
  if (val === true) return 'truncated';
  if (val === false) return 'confirmed_complete';
  return 'completeness_not_recorded';
}

export function dataConfidence(truncVal) {
  if (truncVal === true) return 'low';
  if (truncVal === false) return 'high';
  return 'moderate';
}

export function directionThreshold(baseline, absDb, pctDb) {
  const denom = Math.max(baseline != null ? baseline : 0, BASELINE_FLOOR);
  return Math.max(absDb, pctDb * denom);
}

export function candidateDirection(delta, threshold) {
  if (delta == null || threshold == null) return 'unknown';
  if (delta > threshold) return 'strengthening';
  if (delta < -threshold) return 'easing';
  return 'stable';
}

export function inSeasonEvidence(idx, series, variant) {
  const a3 = series.activity_3d[idx];
  const baseline = series.baseline_median[idx];
  if (a3 == null || a3 < MIN_ACTIVITY) return false;
  if (baseline == null || a3 < IN_SEASON_BASELINE_RATIO * baseline) return false;
  if (variant === 'A') return true;
  const p = variant === 'B' ? series.trailing_p55[idx] : series.trailing_p60[idx];
  if (p == null) return false;
  return a3 >= p;
}

export function heatingEvidence(idx, series, streak, candDir, trunc) {
  if (trunc === true) return false;
  if (candDir !== 'strengthening' || streak < 2) return false;
  const a3 = series.activity_3d[idx];
  const baseline = series.baseline_median[idx];
  if (a3 == null || a3 < MIN_ACTIVITY) return false;
  if (baseline == null || baseline < BASELINE_FLOOR) return false;
  return true;
}

export function coolingEvidence(idx, series, params, streak, candDir, trunc) {
  if (trunc === true) return false;
  if (candDir !== 'easing' || streak < 2) return false;
  const a3 = series.activity_3d[idx];
  const baseline = series.baseline_median[idx];
  if (baseline == null || baseline < MIN_ACTIVITY) return false;
  if (a3 == null) return false;
  return a3 < baseline * params.cooling_ratio;
}

export function updateDirectionStreak(prevStreak, prevDir, candDir, truncVal) {
  if (truncVal === true) return [prevStreak, prevDir];
  if (candDir === 'strengthening' || candDir === 'easing') {
    if (candDir === prevDir) return [prevStreak + 1, candDir];
    return [1, candDir];
  }
  return [0, 'stable'];
}

export function displayCategoryToKey(display) {
  return DISPLAY_TO_KEY[display] || 'steady';
}

export function buildDestinationSeries(panelRows) {
  const rows = [...panelRows].sort((a, b) => a.date.localeCompare(b.date));
  const dates = rows.map((r) => r.date);
  const signals = rows.map((r) => safeNum(r.weighted_private_signal_24h));
  const dailyScores = rows.map((r) => safeNum(r.signal_score));
  const rawGa = rows.map((r) => r.raw_ga_arrivals_24h);
  const trunc = rows.map((r) => r.arrival_count_truncated ?? null);

  const activity3d = rows.map((_, i) => computeActivity3d(signals, i));
  const baselineMedian = [];
  const trailingP55 = [];
  const trailingP60 = [];

  for (let i = 0; i < rows.length; i++) {
    const prior = [];
    for (let j = Math.max(0, i - 7); j < i; j++) {
      if (activity3d[j] != null) prior.push(activity3d[j]);
    }
    baselineMedian.push(median(prior));

    const trail = [];
    for (let j = Math.max(0, i - 14); j < i; j++) {
      if (activity3d[j] != null) trail.push(activity3d[j]);
    }
    trailingP55.push(percentile(trail, 55));
    trailingP60.push(percentile(trail, 60));
  }

  const o5Scores = rows.map((_, i) => {
    const h5 = [];
    for (let lag = 0; lag < O5_WEIGHTS.length; lag++) {
      if (i - lag >= 0) h5.push(dailyScores[i - lag]);
    }
    const val = weightedOutlook(h5, O5_WEIGHTS);
    return val != null ? Math.round(val * 100) / 100 : null;
  });

  return {
    rows,
    dates,
    signals,
    dailyScores,
    rawGa,
    trunc,
    activity_3d: activity3d,
    baseline_median: baselineMedian,
    trailing_p55: trailingP55,
    trailing_p60: trailingP60,
    o5_scores: o5Scores,
  };
}

function nowHeatingEligible(row, contraryDays) {
  if (row.truncation_status === 'truncated') return [false, 'truncated_blocks_now'];
  if (row.truncation_status === 'completeness_not_recorded') {
    return [false, 'completeness_not_recorded_blocks_now'];
  }
  if (row.confidence !== 'high') return [false, 'requires_high_confidence'];
  if (row.confirmed_category !== 'Heating Up') return [false, 'category_not_heating_up'];
  if (contraryDays >= 1) return [false, 'pending_exit_from_heating_up'];
  if (row.candidate_direction !== 'strengthening') return [false, 'direction_not_strengthening'];
  if (row.direction_streak < 2) return [false, 'strengthening_streak_below_2'];
  if (!row.heating_evidence) return [false, 'heating_evidence_not_passing'];
  if ((row.activity_3d || 0) < MIN_ACTIVITY) return [false, 'activity_depth_below_5'];
  return [true, 'eligible'];
}

function nowCoolingEligible(row, contraryDays) {
  if (row.truncation_status === 'truncated') return [false, 'truncated_blocks_now'];
  if (row.truncation_status === 'completeness_not_recorded') {
    return [false, 'completeness_not_recorded_blocks_now'];
  }
  if (row.confidence !== 'high') return [false, 'requires_high_confidence'];
  if (row.confirmed_category !== 'Cooling') return [false, 'category_not_cooling'];
  if (contraryDays >= 1) return [false, 'pending_exit_from_cooling'];
  if (row.candidate_direction !== 'easing') return [false, 'direction_not_easing'];
  if (row.direction_streak < 2) return [false, 'easing_streak_below_2'];
  if (!row.cooling_evidence) return [false, 'cooling_evidence_not_passing'];
  const baseline = row.baseline;
  if (baseline == null || baseline < MIN_ACTIVITY) return [false, 'prior_baseline_below_5'];
  return [true, 'eligible'];
}

export function classifyDestination(series, params = DEFAULT_PARAMS) {
  const n = series.dates.length;
  const results = [];
  const state = {
    category: null,
    category_age: 0,
    contrary_days: 0,
    pending_target: null,
    pending_days: 0,
    bridge_from_heating: false,
    bridge_from_cooling: false,
    direction_streak: 0,
    direction_streak_dir: 'stable',
  };

  const variant = params.in_season_variant;
  const absDb = params.abs_deadband;
  const pctDb = params.pct_deadband;

  for (let idx = 0; idx < n; idx++) {
    const truncVal = series.trunc[idx];
    const truncStat = truncationLabel(truncVal);
    const conf = dataConfidence(truncVal);
    const a3 = series.activity_3d[idx];
    const baseline = series.baseline_median[idx];
    let priorObs = 0;
    for (let j = 0; j < idx; j++) {
      if (series.activity_3d[j] != null) priorObs++;
    }
    const mature = priorObs >= MATURE_MIN_PRIOR;
    const immature = !mature;

    const prevA3 = idx > 0 ? series.activity_3d[idx - 1] : null;
    const delta = a3 != null && prevA3 != null ? a3 - prevA3 : null;
    const thresh = directionThreshold(baseline, absDb, pctDb);
    const candDir = candidateDirection(delta, thresh);

    const prevStreak = state.direction_streak;
    const prevStreakDir = state.direction_streak_dir;
    const [streak, streakDir] = updateDirectionStreak(
      prevStreak,
      prevStreakDir,
      candDir,
      truncVal,
    );
    state.direction_streak = streak;
    state.direction_streak_dir = streakDir;

    const heatEv = heatingEvidence(idx, series, streak, streakDir, truncVal);
    const coolEv = coolingEvidence(idx, series, params, streak, streakDir, truncVal);
    const inEv = inSeasonEvidence(idx, series, variant);

    const prevCat = state.category;
    let reason = '';

    let newCat;
    if (truncVal === true) {
      newCat = prevCat || 'Steady';
      reason = 'truncated_day_holds_category';
      if (prevCat && newCat === prevCat) state.category_age += 1;
      else if (!prevCat) state.category_age = 1;
    } else if (immature) {
      newCat = 'Steady';
      reason = 'immature_insufficient_prior_observations';
      state.category_age = newCat === prevCat ? state.category_age + 1 : 1;
      state.contrary_days = 0;
      state.pending_target = null;
      state.pending_days = 0;
    } else if (prevCat === 'Heating Up') {
      if (streakDir === 'strengthening') {
        state.contrary_days = 0;
        newCat = 'Heating Up';
        reason = 'sustained_strengthening_in_heating_up';
        state.category_age += 1;
      } else {
        state.contrary_days += 1;
        if (state.contrary_days === 1) {
          newCat = 'Heating Up';
          reason = 'sticky_first_contrary_day_retains_heating_up';
          state.category_age += 1;
        } else {
          if (coolEv) {
            newCat = 'In Season';
            reason = 'hu_exit_bridge_to_in_season_cooling_evidence_on_day_2';
            state.bridge_from_heating = true;
          } else if (inEv) {
            newCat = 'In Season';
            reason = 'hu_exit_to_in_season_established_activity';
          } else {
            newCat = 'Steady';
            reason = 'hu_exit_to_steady';
          }
          state.contrary_days = 0;
          state.category_age = 1;
        }
      }
    } else if (prevCat === 'Cooling') {
      if (streakDir === 'easing') {
        state.contrary_days = 0;
        newCat = 'Cooling';
        reason = 'sustained_easing_in_cooling';
        state.category_age += 1;
      } else {
        state.contrary_days += 1;
        if (state.contrary_days === 1) {
          newCat = 'Cooling';
          reason = 'sticky_first_contrary_day_retains_cooling';
          state.category_age += 1;
        } else {
          if (heatEv) {
            newCat = inEv ? 'In Season' : 'Steady';
            reason = inEv
              ? 'co_exit_bridge_to_in_season_heating_evidence'
              : 'co_exit_bridge_to_steady_heating_evidence';
            state.bridge_from_cooling = true;
          } else if (inEv) {
            newCat = 'In Season';
            reason = 'co_exit_recovered_to_in_season';
          } else {
            newCat = 'Steady';
            reason = 'co_exit_to_steady';
          }
          state.contrary_days = 0;
          state.category_age = 1;
        }
      }
    } else {
      const effectivePrev = prevCat == null ? 'Steady' : prevCat;
      newCat = effectivePrev;
      reason = `holding_${effectivePrev.toLowerCase().replace(/ /g, '_')}`;

      if (state.bridge_from_heating && coolEv && streakDir === 'easing') {
        newCat = 'Cooling';
        reason = 'bridge_hu_in_season_to_cooling_confirmed';
        state.bridge_from_heating = false;
        state.category_age = 1;
        state.contrary_days = 0;
        state.pending_target = null;
        state.pending_days = 0;
      } else if (state.bridge_from_cooling && heatEv && streakDir === 'strengthening') {
        newCat = 'Heating Up';
        reason = 'bridge_co_to_heating_confirmed_after_bridge';
        state.bridge_from_cooling = false;
        state.category_age = 1;
        state.contrary_days = 0;
        state.pending_target = null;
        state.pending_days = 0;
      } else if (heatEv) {
        newCat = 'Heating Up';
        reason = 'heating_up_entered_on_second_strengthening_day';
        state.category_age = 1;
        state.contrary_days = 0;
        state.bridge_from_heating = false;
        state.bridge_from_cooling = false;
        state.pending_target = null;
        state.pending_days = 0;
      } else if (coolEv && !state.bridge_from_heating) {
        newCat = 'Cooling';
        reason = 'cooling_entered_on_second_easing_day';
        state.category_age = 1;
        state.contrary_days = 0;
        state.bridge_from_heating = false;
        state.bridge_from_cooling = false;
        state.pending_target = null;
        state.pending_days = 0;
      } else {
        const target = inEv ? 'In Season' : 'Steady';
        if (target !== effectivePrev) {
          if (state.pending_target === target) state.pending_days += 1;
          else {
            state.pending_target = target;
            state.pending_days = 1;
          }
          if (state.pending_days >= 2) {
            newCat = target;
            reason = `transition_${effectivePrev.toLowerCase().replace(/ /g, '_')}_to_${target.toLowerCase().replace(/ /g, '_')}_2day`;
            state.category_age = 1;
            state.pending_target = null;
            state.pending_days = 0;
          } else {
            newCat = effectivePrev;
            reason = `pending_${target.toLowerCase().replace(/ /g, '_')}_day_${state.pending_days}`;
            state.category_age += 1;
          }
        } else {
          state.pending_target = null;
          state.pending_days = 0;
          state.category_age += 1;
          reason = `holding_${effectivePrev.toLowerCase().replace(/ /g, '_')}`;
        }
      }
    }

    if (newCat === 'Heating Up') state.bridge_from_heating = false;
    if (newCat === 'Cooling') state.bridge_from_cooling = false;

    const ratio = a3 != null && baseline && baseline > 0 ? a3 / baseline : null;
    const tp =
      variant === 'B'
        ? series.trailing_p55[idx]
        : variant === 'C'
          ? series.trailing_p60[idx]
          : null;

    const contraryDaysInMover =
      newCat === 'Heating Up' || newCat === 'Cooling' ? state.contrary_days : 0;
    const pendingExit =
      state.contrary_days >= 1 && (newCat === 'Heating Up' || newCat === 'Cooling');

    const row = {
      date: series.dates[idx],
      raw_ga_arrivals_24h: series.rawGa[idx],
      weighted_private_signal_24h: series.signals[idx],
      daily_signal_score: Math.round(series.dailyScores[idx] * 100) / 100,
      go_tango_score_raw: series.o5_scores[idx],
      activity_3d: a3 != null ? Math.round(a3 * 1000) / 1000 : null,
      baseline: baseline != null ? Math.round(baseline * 1000) / 1000 : null,
      activity_ratio: ratio != null ? Math.round(ratio * 10000) / 10000 : null,
      trailing_activity_percentile: tp != null ? Math.round(tp * 1000) / 1000 : null,
      candidate_direction: candDir,
      direction_streak: streak,
      heating_evidence: heatEv,
      cooling_evidence: coolEv,
      confirmed_category: newCat,
      category_age: state.category_age,
      category_reason: reason,
      truncation_status: truncStat,
      confidence: conf,
      contrary_days_in_mover: contraryDaysInMover,
      pending_exit: pendingExit,
    };

    const nhOk = nowHeatingEligible(
      row,
      newCat === 'Heating Up' ? state.contrary_days : 0,
    );
    const ncOk = nowCoolingEligible(
      row,
      newCat === 'Cooling' ? state.contrary_days : 0,
    );
    row.now_heating_eligible = nhOk[0];
    row.now_cooling_eligible = ncOk[0];
    if (nhOk[0]) row.now_eligibility_reason = nhOk[1];
    else if (ncOk[0]) row.now_eligibility_reason = ncOk[1];
    else if (newCat === 'Cooling') row.now_eligibility_reason = ncOk[1];
    else row.now_eligibility_reason = nhOk[1];

    state.category = newCat;
    results.push(row);
  }

  return results;
}

export function publicGoTangoScore(rawO5) {
  if (rawO5 == null || !Number.isFinite(rawO5)) return null;
  return Math.round(rawO5);
}

export function goTangoScorePoints7d(results) {
  const scores = results
    .map((r) => publicGoTangoScore(r.go_tango_score_raw))
    .filter((v) => v != null);
  return scores.length > 7 ? scores.slice(-7) : scores;
}

export function parseHistoryEntry(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') {
    try {
      return JSON.parse(entry);
    } catch {
      return null;
    }
  }
  if (typeof entry === 'object') return entry;
  return null;
}

export function normalizePanelRow(row, fallbackDate) {
  if (!row || !row.id) return null;
  const date = row.date || calendarDateUtc(row.saved_at) || fallbackDate;
  if (!date) return null;
  return {
    id: String(row.id),
    date,
    saved_at: row.saved_at || null,
    raw_ga_arrivals_24h: row.raw_ga_arrivals_24h ?? row.arrivals_count ?? null,
    weighted_private_signal_24h: safeNum(
      row.weighted_private_signal_24h ?? row.qualified_private_arrivals_24h,
    ),
    signal_score: safeNum(row.signal_score),
    arrival_count_truncated:
      row.arrival_count_truncated === undefined ? null : row.arrival_count_truncated,
    _saved_at: row.saved_at || null,
  };
}

/**
 * Build deduplicated chronological panel rows per destination from KV-shaped inputs.
 */
export function buildDestinationPanels(latestPayload, historyList, publicDestinationIds) {
  const allowed = new Set(publicDestinationIds);
  const byDestDate = new Map();

  const ingestRow = (row, fallbackDate) => {
    const point = normalizePanelRow(row, fallbackDate);
    if (!point || !allowed.has(point.id)) return;
    const key = `${point.id}|${point.date}`;
    const existing = byDestDate.get(key);
    if (!existing) {
      byDestDate.set(key, point);
      return;
    }
    const existingTs = existing._saved_at ? Date.parse(existing._saved_at) : 0;
    const nextTs = point._saved_at ? Date.parse(point._saved_at) : 0;
    if (nextTs >= existingTs) byDestDate.set(key, point);
  };

  for (const raw of historyList || []) {
    const rec = parseHistoryEntry(raw);
    if (!rec || rec.history_version !== HISTORY_VERSION) continue;
    const recDate = calendarDateUtc(rec.saved_at);
    const perDest = Array.isArray(rec.per_destination) ? rec.per_destination : [];
    for (const row of perDest) ingestRow(row, recDate);
  }

  const latestDestinations = Array.isArray(latestPayload?.destinations)
    ? latestPayload.destinations
    : [];
  const latestSavedAt = latestPayload?.saved_at || null;
  const latestDate = calendarDateUtc(latestSavedAt);
  for (const row of latestDestinations) {
    if (!row || !allowed.has(String(row.id))) continue;
    ingestRow(
      {
        ...row,
        date: latestDate,
        saved_at: latestSavedAt,
      },
      latestDate,
    );
  }

  const byDest = new Map();
  for (const point of byDestDate.values()) {
    const { _saved_at, ...rest } = point;
    if (!byDest.has(rest.id)) byDest.set(rest.id, []);
    byDest.get(rest.id).push(rest);
  }

  for (const rows of byDest.values()) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
  }

  return byDest;
}

export function replayDestination(panelRows, params = DEFAULT_PARAMS) {
  const series = buildDestinationSeries(panelRows);
  const daily = classifyDestination(series, params);
  return { series, daily };
}

export function formatDestinationResult(destMeta, dailyResults) {
  const latest = dailyResults[dailyResults.length - 1];
  const historyDaysUsed = dailyResults.length;
  const points7d = goTangoScorePoints7d(dailyResults);

  return {
    id: destMeta.id,
    name: destMeta.name,
    go_tango_score: publicGoTangoScore(latest.go_tango_score_raw),
    go_tango_score_version: GOTANGO_SCORE_VERSION,
    daily_signal_score: Math.round(latest.daily_signal_score),
    activity_3d: latest.activity_3d,
    activity_baseline_7d: latest.baseline,
    activity_ratio: latest.activity_ratio,
    trailing_activity_percentile: latest.trailing_activity_percentile,
    candidate_direction: latest.candidate_direction,
    direction_streak_days: latest.direction_streak,
    confirmed_category: displayCategoryToKey(latest.confirmed_category),
    category_age_days: latest.category_age,
    category_reason: latest.category_reason,
    pending_exit: latest.pending_exit,
    contrary_days: latest.contrary_days_in_mover,
    now_heating_eligible: latest.now_heating_eligible,
    now_cooling_eligible: latest.now_cooling_eligible,
    now_eligibility_reason: latest.now_eligibility_reason,
    data_confidence: latest.confidence,
    truncation_status: latest.truncation_status,
    history_days_used: historyDaysUsed,
    go_tango_score_points_7d: points7d,
    raw_ga_arrivals_24h: latest.raw_ga_arrivals_24h,
  };
}

function sortHeatingShortlist(a, b) {
  const ratioDiff = (b.activity_ratio ?? 0) - (a.activity_ratio ?? 0);
  if (ratioDiff !== 0) return ratioDiff;
  const deltaDiff =
    (b.activity_3d ?? 0) -
    (b.activity_baseline_7d ?? 0) -
    ((a.activity_3d ?? 0) - (a.activity_baseline_7d ?? 0));
  if (deltaDiff !== 0) return deltaDiff;
  const a3Diff = (b.activity_3d ?? 0) - (a.activity_3d ?? 0);
  if (a3Diff !== 0) return a3Diff;
  const scoreDiff = (b.go_tango_score ?? 0) - (a.go_tango_score ?? 0);
  if (scoreDiff !== 0) return scoreDiff;
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
    sensitivity: 'base',
  });
}

function sortCoolingShortlist(a, b) {
  const ratioDiff = (a.activity_ratio ?? 0) - (b.activity_ratio ?? 0);
  if (ratioDiff !== 0) return ratioDiff;
  const deltaDiff =
    (b.activity_baseline_7d ?? 0) -
    (b.activity_3d ?? 0) -
    ((a.activity_baseline_7d ?? 0) - (a.activity_3d ?? 0));
  if (deltaDiff !== 0) return deltaDiff;
  const baselineDiff = (b.activity_baseline_7d ?? 0) - (a.activity_baseline_7d ?? 0);
  if (baselineDiff !== 0) return baselineDiff;
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
    sensitivity: 'base',
  });
}

export function computeGoTangoScoreResponse({
  latestPayload,
  historyList,
  publicDestinations,
  generatedAt = new Date().toISOString(),
  params = DEFAULT_PARAMS,
}) {
  const warnings = [];
  const publicIds = publicDestinations.map((d) => d.id);
  const panels = buildDestinationPanels(latestPayload, historyList, publicIds);
  const destinations = [];

  for (const destMeta of publicDestinations) {
    const panelRows = panels.get(destMeta.id) || [];
    if (panelRows.length === 0) {
      warnings.push(`missing_history:${destMeta.id}`);
    }
    const { daily } = replayDestination(panelRows, params);
    destinations.push(formatDestinationResult(destMeta, daily));
  }

  const categoryCounts = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0]));
  for (const d of destinations) {
    if (categoryCounts[d.confirmed_category] != null) {
      categoryCounts[d.confirmed_category] += 1;
    } else {
      warnings.push(`unknown_category:${d.id}:${d.confirmed_category}`);
    }
  }

  const heatingShortlist = destinations
    .filter((d) => d.now_heating_eligible)
    .sort(sortHeatingShortlist)
    .slice(0, 6)
    .map((d) => d.id);

  const coolingShortlist = destinations
    .filter((d) => d.now_cooling_eligible)
    .sort(sortCoolingShortlist)
    .slice(0, 3)
    .map((d) => d.id);

  return {
    go_tango_score_version: GOTANGO_SCORE_VERSION,
    source_saved_at: latestPayload?.saved_at || null,
    generated_at: generatedAt,
    total_destinations: destinations.length,
    category_counts: categoryCounts,
    now_heating_ids: heatingShortlist,
    now_cooling_ids: coolingShortlist,
    heating_shortlist: heatingShortlist,
    cooling_shortlist: coolingShortlist,
    validation_warnings: warnings,
    destinations,
  };
}

export function validateGoTangoScoreResponse(response, expectedSourceSavedAt, publicIds) {
  const warnings = [];
  const fatal = [];

  if (!response || typeof response !== 'object') {
    fatal.push('invalid_response');
    return { ok: false, fatal, warnings };
  }
  if (response.go_tango_score_version !== GOTANGO_SCORE_VERSION) {
    fatal.push('invalid_version');
  }
  if (expectedSourceSavedAt && response.source_saved_at !== expectedSourceSavedAt) {
    fatal.push('source_saved_at_mismatch');
  }
  if (response.total_destinations !== publicIds.length) {
    fatal.push('total_destinations_mismatch');
  }

  const ids = new Set();
  for (const d of response.destinations || []) {
    if (!d || !d.id) {
      fatal.push('missing_destination_id');
      continue;
    }
    if (ids.has(d.id)) fatal.push(`duplicate_id:${d.id}`);
    ids.add(d.id);
    for (const field of [
      'go_tango_score',
      'go_tango_score_version',
      'daily_signal_score',
      'confirmed_category',
      'candidate_direction',
      'direction_streak_days',
      'go_tango_score_points_7d',
    ]) {
      if (!(field in d)) fatal.push(`missing_field:${d.id}:${field}`);
    }
  }

  for (const id of publicIds) {
    if (!ids.has(id)) fatal.push(`missing_public_destination:${id}`);
  }

  const counts = response.category_counts || {};
  const categoryTotal = CATEGORY_KEYS.reduce((sum, k) => sum + (counts[k] || 0), 0);
  if (categoryTotal !== publicIds.length) fatal.push('category_total_mismatch');

  for (const w of response.validation_warnings || []) {
    if (String(w).startsWith('missing_history:')) warnings.push(w);
  }

  return { ok: fatal.length === 0, fatal, warnings };
}

/** Build panel rows from backtest export shape for golden tests. */
export function buildPanelFromBacktestRows(rows) {
  const byDest = new Map();
  for (const row of rows) {
    const id = row.destination_id || row.id;
    if (!id) continue;
    const normalized = {
      id,
      date: row.date,
      saved_at: row.saved_at,
      raw_ga_arrivals_24h: row.raw_ga_arrivals_24h,
      weighted_private_signal_24h: row.weighted_private_signal_24h,
      signal_score: row.signal_score,
      arrival_count_truncated: row.arrival_count_truncated ?? null,
    };
    if (!byDest.has(id)) byDest.set(id, []);
    byDest.get(id).push(normalized);
  }
  for (const destRows of byDest.values()) {
    destRows.sort((a, b) => a.date.localeCompare(b.date));
  }
  return byDest;
}
