/**
 * Weekly Brief — fact sheet, LLM prompt, validation, and template fallback.
 * Isolated from destination news (no web search, no news KV).
 */

import { DESTINATIONS } from './destinations.config.js';

const DESTINATION_META = new Map(DESTINATIONS.map((d) => [d.id, d]));

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];
const DAY_NAMES = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
];

const REGION_THEMES = {
  mediterranean: [
    'Greek Islands', 'Balearic Islands', "Côte d'Azur", 'Amalfi Coast', 'Sicily', 'Cyclades',
  ],
  us_summer: [
    'Hamptons', 'Nantucket', "Martha's Vineyard", 'Cape Cod', 'Block Island', 'Hilton Head',
    'Palm Beach', 'Jackson Hole', 'Sun Valley', 'Napa Valley', 'Santa Fe',
  ],
  caribbean: [
    'French Caribbean', 'Caribbean', 'British Caribbean', 'Bahamas',
  ],
};

export function formatBriefIssueDate(date = new Date()) {
  const dayName = DAY_NAMES[date.getUTCDay()];
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTH_NAMES[date.getUTCMonth()];
  return {
    iso: date.toISOString().slice(0, 10),
    kicker: `THE BRIEF · ${dayName}, ${day} ${month}`,
  };
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function regionTheme(region, name) {
  const labels = [name, region].filter(Boolean);
  for (const [theme, regions] of Object.entries(REGION_THEMES)) {
    if (labels.some((label) => regions.includes(label))) return theme;
  }
  return 'other';
}

function originLabel(origin) {
  if (!origin || typeof origin !== 'object') return null;
  return origin.name || origin.origin_city || origin.city || origin.label || null;
}

export function mergeBriefDestinations(arrivalsPayload, scoreResponse) {
  const arrivals = Array.isArray(arrivalsPayload?.destinations)
    ? arrivalsPayload.destinations.filter((d) => d && d.ok === true)
    : [];
  const scoreMap = new Map();
  if (scoreResponse?.ok && Array.isArray(scoreResponse.destinations)) {
    for (const row of scoreResponse.destinations) {
      if (row?.id) scoreMap.set(row.id, row);
    }
  }

  return arrivals.map((dest) => {
    const v2 = scoreMap.get(dest.id);
    if (!v2) return { ...dest };
    return {
      ...dest,
      go_tango_score: v2.go_tango_score,
      go_tango_score_points_7d: v2.go_tango_score_points_7d,
      confirmed_category: v2.confirmed_category,
      data_confidence: v2.data_confidence,
      truncation_status: v2.truncation_status,
      activity_ratio: v2.activity_ratio,
      category_reason: v2.category_reason,
    };
  });
}

export function summarizeDestination(dest) {
  const meta = DESTINATION_META.get(dest.id) || {};
  const points = Array.isArray(dest.go_tango_score_points_7d)
    ? dest.go_tango_score_points_7d.map((v) => safeNum(v)).filter((v) => v > 0)
    : [];
  const score = safeNum(dest.go_tango_score) || safeNum(dest.signal_score) || null;
  const first = points.length ? points[0] : (score || null);
  const last = points.length ? points[points.length - 1] : (score || null);
  const high = points.length ? Math.max(...points) : score;
  const low = points.length ? Math.min(...points) : score;
  const delta = first != null && last != null ? last - first : null;

  const topOrigins = (Array.isArray(dest.top_origins) ? dest.top_origins : [])
    .slice(0, 6)
    .map((o) => ({
      name: originLabel(o),
      count: safeNum(o.count),
    }))
    .filter((o) => o.name);

  const truncated = Boolean(dest.arrival_count_truncated);
  const unknownGa = safeNum(dest.unknown_ga_arrivals_24h);
  const lowConfidence = String(dest.data_confidence || '').toLowerCase() === 'low';

  return {
    id: dest.id,
    name: dest.name || meta.name || dest.id,
    region: meta.region || 'Unknown',
    region_theme: regionTheme(meta.region, dest.name || meta.name),
    go_tango_score: score || null,
    score_delta_7d: delta,
    score_7d_high: high || null,
    score_7d_low: low || null,
    score_7d_start: first,
    confirmed_category: dest.confirmed_category || null,
    raw_ga_arrivals_24h: safeNum(dest.raw_ga_arrivals_24h),
    premium_private_arrivals_24h: safeNum(dest.premium_private_arrivals_24h),
    light_ga_arrivals_24h: safeNum(dest.light_ga_arrivals_24h),
    top_origins: topOrigins,
    arrival_count_truncated: truncated,
    unknown_ga_arrivals_24h: unknownGa,
    data_confidence: dest.data_confidence || null,
    data_quality_ok: !truncated && !lowConfidence,
  };
}

function sortByScoreDesc(a, b) {
  const scoreDiff = (b.go_tango_score ?? 0) - (a.go_tango_score ?? 0);
  if (scoreDiff !== 0) return scoreDiff;
  if (a.data_quality_ok !== b.data_quality_ok) return a.data_quality_ok ? -1 : 1;
  return (b.score_delta_7d ?? 0) - (a.score_delta_7d ?? 0);
}

/** Blend: board level + US summer leadership + breakout weekly moves. */
export function pickBlendedLeadStory({ scorePool, risers, usSummerStandouts }) {
  const globalTop = scorePool[0] || null;
  const topRiser = risers[0] || null;
  const usTop = usSummerStandouts[0] || null;

  if (!globalTop) return null;

  const globalScore = globalTop.go_tango_score ?? 0;
  const SCORE_GAP = 8;
  const RISER_DELTA_MIN = 12;

  if (usTop?.go_tango_score != null) {
    const usScore = usTop.go_tango_score;
    const gap = globalScore - usScore;
    if (usScore >= globalScore || gap <= SCORE_GAP / 2) {
      return usTop;
    }
  }

  if (topRiser && topRiser.id !== globalTop.id) {
    const riserScore = topRiser.go_tango_score ?? 0;
    const riserDelta = topRiser.score_delta_7d ?? 0;
    if (riserDelta >= RISER_DELTA_MIN && globalScore - riserScore <= SCORE_GAP) {
      return topRiser;
    }
  }

  return globalTop;
}

function sortByDeltaDesc(a, b) {
  const da = a.score_delta_7d ?? -Infinity;
  const db = b.score_delta_7d ?? -Infinity;
  if (db !== da) return db - da;
  return (b.go_tango_score ?? 0) - (a.go_tango_score ?? 0);
}

function sortByDeltaAsc(a, b) {
  const da = a.score_delta_7d ?? Infinity;
  const db = b.score_delta_7d ?? Infinity;
  if (da !== db) return da - db;
  return (a.go_tango_score ?? 0) - (b.go_tango_score ?? 0);
}

export function buildWeeklyBriefFactSheet({
  arrivalsPayload,
  scoreResponse,
  homepage,
  generatedAt = new Date().toISOString(),
  issueDate = new Date(),
}) {
  const merged = mergeBriefDestinations(arrivalsPayload, scoreResponse);
  const summaries = merged.map(summarizeDestination);
  const quality = summaries.filter((s) => s.data_quality_ok && s.go_tango_score != null);
  const scorePool = summaries
    .filter((s) => s.go_tango_score != null && String(s.data_confidence || '').toLowerCase() !== 'low')
    .sort(sortByScoreDesc);

  const risers = [...quality].filter((s) => (s.score_delta_7d ?? 0) > 0).sort(sortByDeltaDesc);

  const usStandouts = scorePool
    .filter((s) => s.region_theme === 'us_summer')
    .slice(0, 3);

  const leadStory = pickBlendedLeadStory({
    scorePool,
    risers,
    usSummerStandouts: usStandouts,
  });

  const fallers = [...quality].filter((s) => (s.score_delta_7d ?? 0) < 0).sort(sortByDeltaAsc);

  const medRisers = risers.filter((s) => s.region_theme === 'mediterranean');
  const medContrast = medRisers.find((s) => s.id !== leadStory?.id) ||
    scorePool.find((s) => s.region_theme === 'mediterranean' && s.id !== leadStory?.id);

  const caribbeanRisers = risers.filter((s) => s.region_theme === 'caribbean').slice(0, 2);
  const caribbeanFallers = fallers.filter((s) => s.region_theme === 'caribbean').slice(0, 2);

  const sleeperRaw = homepage?.sleeper_pick || null;
  let sleeper = null;
  if (sleeperRaw?.id) {
    const mergedSleeper = merged.find((d) => d.id === sleeperRaw.id) || { ...sleeperRaw };
    sleeper = summarizeDestination(mergedSleeper);
  } else {
    sleeper = risers.find((s) => s.go_tango_score != null && s.go_tango_score < 75) || null;
  }

  const cautionCandidates = summaries
    .filter((s) => s.arrival_count_truncated || s.unknown_ga_arrivals_24h > 5)
    .sort((a, b) => (b.go_tango_score ?? 0) - (a.go_tango_score ?? 0));

  const issue = formatBriefIssueDate(issueDate);

  return {
    issue_date: issue.iso,
    kicker: issue.kicker,
    generated_at: generatedAt,
    arrivals_saved_at: arrivalsPayload?.saved_at || scoreResponse?.source_saved_at || null,
    score_version: scoreResponse?.go_tango_score_version || null,
    totals: homepage?.totals || null,
    lead_story: leadStory,
    med_contrast: medContrast || null,
    us_summer_standouts: usStandouts,
    caribbean_risers: caribbeanRisers,
    caribbean_fallers: caribbeanFallers,
    top_risers: risers.slice(0, 6),
    top_fallers: fallers.slice(0, 4),
    sleeper,
    caution: cautionCandidates[0] || null,
    destination_count: summaries.length,
  };
}

export function buildWeeklyBriefPrompt(factSheet) {
  const factsJson = JSON.stringify(factSheet, null, 2);
  return `You are GoTango Editorial writing The Tuesday Brief — a weekly travel letter for curious travelers, not data analysts.

VOICE:
- Write like a sharp travel editor at a premium magazine: warm, confident, specific, easy to read.
- Explain what is happening in destinations and why it matters to someone planning or dreaming about travel.
- Use plain English. Prefer "private flights", "travel momentum", "heating up", "cooling off", "summer season", "beach season".
- Mention the GoTango Index at most once in the full article, and only if it helps readers understand scale (e.g. "reached 80 on our Index").
- Never use jargon such as: general-aviation, GA, turboprop, aviation feed, collection limits, seven-day view, data confidence, truncated feed, unidentified-aircraft, premium private aircraft classifications.

STRUCTURE (return JSON only):
{
  "headline_before": "Short clause ending with a space before the emphasized word(s), e.g. Ibiza takes the summer ",
  "headline_emphasis": "last word(s) with period, e.g. lead.",
  "read_minutes": 3,
  "lede": "One vivid sentence summarizing the week's travel map (no markdown).",
  "paragraphs": [
    "4-6 paragraphs. Open key paragraphs with a strong, readable thesis. Translate the data into travel stories: who is going where, which regions are heating up or handing off, what feels early vs established. Name origin cities when they paint a picture (e.g. Nice and Cannes). Use arrival counts sparingly and only as human context."
  ],
  "sleeper": {
    "title": "Destination name from sleeper",
    "description": "2-3 sentences on the sleeper pick in plain travel language"
  },
  "caution": {
    "title": "Destination name or null",
    "text": "One short paragraph in plain language if caution is set in facts — explain the destination may look hotter than the underlying read supports, without technical data caveats. Null if caution is null in facts."
  },
  "closing": "Final paragraph: what to watch next week (2-3 destinations), written for travelers."
}

RULES:
- Use only facts from the JSON below. Do not invent destinations, scores, arrival counts, origins, or trends.
- If caution in facts is null, set caution.title and caution.text to null.
- If score_delta_7d is null or zero, do not claim a weekly point change.
- Use straight apostrophes; no markdown.
- Do not mention GoTango as a product more than once.
- Prefer lead_story, med_contrast, us_summer_standouts, caribbean_risers/fallers for narrative threads.

FACT SHEET JSON:
${factsJson}`;
}

export function getWeeklyBriefModel() {
  return process.env.WEEKLY_BRIEF_MODEL || process.env.NEWS_CONTEXT_MODEL || 'gpt-5.4-mini';
}

export function buildBriefResponsesApiRequest(prompt) {
  return {
    model: getWeeklyBriefModel(),
    store: false,
    reasoning: { effort: 'low' },
    text: { verbosity: 'medium' },
    max_output_tokens: Number(process.env.WEEKLY_BRIEF_MAX_OUTPUT_TOKENS || 3500),
    input: prompt,
  };
}

export function extractResponsesOutputText(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  const parts = [];
  for (const item of output) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        parts.push(part.text);
      }
    }
  }
  return parts.join('').trim();
}

export function parseBriefJsonFromModelText(text) {
  if (!text || typeof text !== 'string') return null;
  let raw = text.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function namesFromFactSheet(factSheet) {
  const names = new Set();
  for (const key of [
    'lead_story', 'med_contrast', 'sleeper', 'caution',
  ]) {
    const row = factSheet[key];
    if (row?.name) names.add(row.name);
  }
  for (const listKey of [
    'us_summer_standouts', 'caribbean_risers', 'caribbean_fallers', 'top_risers', 'top_fallers',
  ]) {
    for (const row of factSheet[listKey] || []) {
      if (row?.name) names.add(row.name);
    }
  }
  return names;
}

export function validateWeeklyBriefDraft(draft, factSheet) {
  const errors = [];
  if (!draft || typeof draft !== 'object') {
    return { ok: false, errors: ['draft_missing'] };
  }
  for (const field of ['headline_before', 'headline_emphasis', 'lede', 'closing']) {
    if (!draft[field] || typeof draft[field] !== 'string' || !draft[field].trim()) {
      errors.push(`missing_${field}`);
    }
  }
  if (!Array.isArray(draft.paragraphs) || draft.paragraphs.length < 3) {
    errors.push('paragraphs_too_few');
  }
  if (!draft.sleeper?.title || !draft.sleeper?.description) {
    errors.push('sleeper_incomplete');
  }

  const allowedNames = namesFromFactSheet(factSheet);
  const textBlob = [
    draft.headline_before,
    draft.headline_emphasis,
    draft.lede,
    ...(draft.paragraphs || []),
    draft.sleeper?.description,
    draft.caution?.text,
    draft.closing,
  ].join(' ');

  for (const name of allowedNames) {
    if (textBlob.includes(name)) continue;
  }

  // Soft check: at least one fact-sheet destination name should appear
  const mentioned = [...allowedNames].some((name) => textBlob.includes(name));
  if (!mentioned && allowedNames.size > 0) {
    errors.push('no_destination_names_used');
  }

  return { ok: errors.length === 0, errors };
}

export function normalizeWeeklyBriefManifest(draft, factSheet, meta = {}) {
  const readMinutes = Number(draft.read_minutes) || 3;
  return {
    issue_date: factSheet.issue_date,
    kicker: factSheet.kicker,
    headline_before: String(draft.headline_before || '').trim(),
    headline_emphasis: String(draft.headline_emphasis || '').trim(),
    read_time: `${readMinutes} min read`,
    byline: 'By GoTango Editorial',
    lede: String(draft.lede || '').trim(),
    paragraphs: (draft.paragraphs || []).map((p) => String(p).trim()).filter(Boolean),
    sleeper: {
      title: String(draft.sleeper?.title || factSheet.sleeper?.name || '').trim(),
      description: String(draft.sleeper?.description || '').trim(),
    },
    caution: draft.caution?.title && draft.caution?.text
      ? {
          title: String(draft.caution.title).trim(),
          text: String(draft.caution.text).trim(),
        }
      : null,
    closing: String(draft.closing || '').trim(),
    generated_at: meta.generated_at || new Date().toISOString(),
    generator: meta.generator || 'weekly-brief',
    arrivals_saved_at: factSheet.arrivals_saved_at,
    score_version: factSheet.score_version,
  };
}

function fmtScore(n) {
  return n == null ? '—' : String(Math.round(n));
}

function fmtDelta(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded === 0) return null;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}`;
}

function briefDisplayName(name) {
  if (!name) return '';
  const base = String(name).replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (/^hamptons$/i.test(base)) return 'The Hamptons';
  return base;
}

function isLikelyCityOrigin(name) {
  if (!name) return false;
  const n = String(name).trim();
  if (!n) return false;
  if (/int'?l|airport|airfield|municipal|afb|heliport|tower|county|gabreski/i.test(n)) return false;
  if (/\b(town|village|parish|regional|republic|muni|municipal)\b/i.test(n)) return false;
  if (/\bstate$/i.test(n)) return false;
  if (n.split(/\s+/).length > 3) return false;
  if (/^[A-Z][a-z]+ [A-Z]\./.test(n)) return false;
  return n.length <= 24;
}

function briefSubjectVerb(name, singular, plural) {
  return /^the hamptons$/i.test(briefDisplayName(name)) ? plural : singular;
}

function weeklyChangePhrase(delta) {
  const formatted = fmtDelta(delta);
  if (!formatted) return '';
  const points = Math.abs(Math.round(delta));
  if (delta > 0) return `, up ${points} points this week`;
  return `, down ${points} points this week`;
}

function originTravelPhrase(origins) {
  if (!origins?.length) return '';
  const names = origins
    .map((o) => o.name)
    .filter((name) => isLikelyCityOrigin(name))
    .slice(0, 3);
  if (!names.length) return '';
  if (names.length === 1) {
    return ` Traffic from ${names[0]} stood out.`;
  }
  if (names.length === 2) {
    return ` Traffic from ${names[0]} and ${names[1]} helped shape the week.`;
  }
  return ` Traffic from ${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]} helped shape the week.`;
}

function privateTravelPhrase(dest) {
  const total = safeNum(dest.raw_ga_arrivals_24h);
  const premium = safeNum(dest.premium_private_arrivals_24h);
  if (!total) {
    return 'Private travel picked up in a way that is hard to ignore.';
  }
  if (premium >= Math.max(8, total * 0.35)) {
    return `The latest day of data showed ${total} private flights, with a heavy share of premium aircraft.`;
  }
  return `The latest day of data showed ${total} private flights — a solid volume for this point in the season.`;
}

function briefHeadline(lead) {
  if (!lead) return { before: 'The travel map ', emphasis: 'turns.' };
  const name = briefDisplayName(lead.name);
  const summerLead = lead.region_theme === 'us_summer'
    || lead.region_theme === 'mediterranean'
    || lead.region_theme === 'caribbean';
  if (summerLead || (lead.score_delta_7d ?? 0) > 8) {
    const verb = /^the hamptons$/i.test(name) ? 'take' : 'takes';
    return { before: `${name} ${verb} the summer `, emphasis: 'lead.' };
  }
  return { before: `${name} leads the weekly `, emphasis: 'map.' };
}

function buildBriefLede(factSheet) {
  const lead = factSheet.lead_story;
  const us = factSheet.us_summer_standouts?.[0];
  const caribUp = factSheet.caribbean_risers?.[0];
  const caribDown = factSheet.caribbean_fallers?.[0];
  const threads = [];

  if (lead) {
    const name = briefDisplayName(lead.name);
    if (lead.region_theme === 'mediterranean') {
      threads.push(`${name} is taking control of the Mediterranean`);
    } else if (lead.region_theme === 'us_summer') {
      threads.push(`${name} ${briefSubjectVerb(lead.name, 'is switching on for summer', 'are switching on for summer')}`);
    } else if (lead.region_theme === 'caribbean') {
      threads.push(`the Caribbean is finding fresh momentum through ${name}`);
    } else {
      threads.push(`${name} is leading the week`);
    }
  }
  if (us && us.id !== lead?.id) {
    threads.push(`${briefDisplayName(us.name)} is building alongside the broader U.S. summer circuit`);
  }
  if (caribUp && caribDown) {
    threads.push('the Caribbean is becoming more selective');
  } else if (caribUp) {
    threads.push(`${briefDisplayName(caribUp.name)} is standing out in the Caribbean`);
  }

  if (!threads.length) {
    return 'This week brought selective strength across the map rather than one global surge.';
  }
  if (threads.length === 1) {
    return `The travel map is sharpening: ${threads[0]}.`;
  }
  return `The travel map is beginning to separate: ${threads.slice(0, -1).join(', ')}, and ${threads[threads.length - 1]}.`;
}

export function buildTemplateWeeklyBrief(factSheet) {
  const lead = factSheet.lead_story;
  const paragraphs = [];

  if (lead) {
    const name = briefDisplayName(lead.name);
    const indexPhrase = lead.go_tango_score != null
      ? ` Its GoTango Index reached ${fmtScore(lead.go_tango_score)}${weeklyChangePhrase(lead.score_delta_7d)}.`
      : '';
    paragraphs.push(
      `${name} produced the clearest destination move of the week.${indexPhrase} ${privateTravelPhrase(lead)}${originTravelPhrase(lead.top_origins)}`.trim(),
    );
  }

  const contrast = factSheet.med_contrast;
  if (contrast && contrast.id !== lead?.id) {
    const name = briefDisplayName(contrast.name);
    const easing = (contrast.score_delta_7d ?? 0) < 0;
    const rising = (contrast.score_delta_7d ?? 0) > 0;
    let movement = 'is still firmly in the conversation';
    if (easing) movement = 'is still active, but the direction has softened';
    if (rising) movement = 'is still building';
    paragraphs.push(
      `${name} ${movement}. The Mediterranean story this week is less about one island dominating and more about which markets are still accelerating versus settling from an earlier peak.`,
    );
  }

  const us = factSheet.us_summer_standouts || [];
  if (us.length) {
    const names = us.map((d) => briefDisplayName(d.name));
    const label = names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
    const verb = names.length === 1
      ? briefSubjectVerb(names[0], 'is', 'are')
      : 'are';
    paragraphs.push(
      `The United States is making its own seasonal handoff. ${label} ${verb} among the standouts, with private traffic building toward islands, beach houses, golf markets, and familiar summer circuits.`,
    );
  }

  const caribUp = factSheet.caribbean_risers?.[0];
  const caribDown = factSheet.caribbean_fallers?.[0];
  if (caribUp || caribDown) {
    const upPart = caribUp
      ? `${briefDisplayName(caribUp.name)} is climbing`
      : null;
    const downPart = caribDown
      ? `${briefDisplayName(caribDown.name)} has cooled`
      : null;
    const body = [upPart, downPart].filter(Boolean).join(', while ');
    paragraphs.push(
      `The Caribbean is less uniform. ${body}. The read is selective strength rather than one basin-wide surge.`,
    );
  }

  const sleeper = factSheet.sleeper;
  const caution = factSheet.caution;

  let cautionBlock = null;
  if (caution) {
    const name = briefDisplayName(caution.name);
    cautionBlock = {
      title: caution.name,
      text: `One caution sits near the top of the board. ${name} looks busy this week, but the underlying flight picture is harder to read than usual. The travel may be real; we would treat the ranking with a little more skepticism until the picture clears.`,
    };
  }

  const watchNames = [lead, us[0], factSheet.caribbean_risers?.[0]]
    .filter(Boolean)
    .map((d) => briefDisplayName(d.name))
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .slice(0, 3);

  const headline = briefHeadline(lead);

  return normalizeWeeklyBriefManifest({
    headline_before: headline.before,
    headline_emphasis: headline.emphasis,
    read_minutes: 3,
    lede: buildBriefLede(factSheet),
    paragraphs,
    sleeper: {
      title: sleeper?.name || 'Watchlist',
      description: sleeper
        ? `${briefDisplayName(sleeper.name)} has quietly strengthened${weeklyChangePhrase(sleeper.score_delta_7d) || ''}. It is not yet leading the board, but the mix of private traffic has enough depth to deserve attention.${originTravelPhrase(sleeper.top_origins)}`.trim()
        : 'No clear sleeper emerged in this week\'s travel picture.',
    },
    caution: cautionBlock,
    closing: watchNames.length
      ? `Watch whether ${watchNames.join(', ')} can hold their current levels. Those markets will tell us whether this is an early-season move or the beginning of a fuller summer pattern.`
      : 'Watch the heating and cooling lists on Now for confirmation in the days ahead.',
  }, factSheet, { generator: 'weekly-brief-template' });
}

export async function callWeeklyBriefOpenAi(prompt, apiKey) {
  const requestBody = buildBriefResponsesApiRequest(prompt);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  let payload = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error?.message || `OpenAI HTTP ${response.status}`,
    };
  }

  const text = extractResponsesOutputText(payload);
  const draft = parseBriefJsonFromModelText(text);
  if (!draft) {
    return { ok: false, error: 'Failed to parse brief JSON from model output', raw: text };
  }

  return { ok: true, draft, raw: text };
}

export async function generateWeeklyBriefManifest({
  factSheet,
  apiKey = process.env.OPENAI_API_KEY?.trim() || '',
  templateOnly = false,
}) {
  let manifest;
  let generator = 'weekly-brief-template';
  let llmError = null;

  if (!templateOnly && apiKey) {
    const prompt = buildWeeklyBriefPrompt(factSheet);
    const result = await callWeeklyBriefOpenAi(prompt, apiKey);
    if (result.ok) {
      const validation = validateWeeklyBriefDraft(result.draft, factSheet);
      if (validation.ok) {
        manifest = normalizeWeeklyBriefManifest(result.draft, factSheet, {
          generator: 'weekly-brief-llm',
        });
        generator = 'weekly-brief-llm';
      } else {
        llmError = `validation: ${validation.errors.join(', ')}`;
      }
    } else {
      llmError = result.error || 'llm_failed';
    }
  } else if (!templateOnly && !apiKey) {
    llmError = 'openai_api_key_missing';
  }

  if (!manifest) {
    manifest = buildTemplateWeeklyBrief(factSheet);
    manifest.generator = generator;
  }

  return { manifest, generator, llmError };
}

export function serializeWeeklyBriefConfig(manifest) {
  const json = JSON.stringify(manifest, null, 2).replace(/</g, '\\u003c');
  return `/**
 * Weekly Brief manifest — generated by scripts/build-weekly-brief.mjs
 * Issue: ${manifest.issue_date}
 */
window.WEEKLY_BRIEF_MANIFEST = ${json};
`;
}
