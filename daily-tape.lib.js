/**
 * Daily Tape — LLM prompt, validation, normalization, OpenAI synthesis,
 * server-side input building, and KV cache.
 *
 * Architecture: the Daily Tape is generated once per day by the
 * /api/refresh-daily-tape cron and saved to KV. /api/get-daily-tape serves the
 * cached brief to every user instantly (a single KV read, no per-user AI call).
 * The client keeps a deterministic builder for the brief that renders before the
 * cached brief arrives.
 */

import { kv } from '@vercel/kv';
import {
  extractResponsesOutputText,
  parseBriefJsonFromModelText,
  loadBriefSourceDataFromKv,
} from './weekly-brief.lib.js';
import { NEWS_KV_KEYS } from './news-context.lib.js';
import { DESTINATIONS } from './destinations.config.js';
import { NOW_MIN_PUBLIC_SCORE } from './gotango-score-v2.lib.js';
import {
  buildBrowserSafeNewsPayload,
  findLatestEntryForId,
} from './api/get-destination-news.js';

export const DAILY_TAPE_KV_KEYS = {
  latest: 'gotango:daily-tape:latest',
};

const DAILY_TAPE_DESTINATION_REGION = new Map(
  DESTINATIONS.map((d) => [d.id, d.region]),
);

export const DAILY_TAPE_PROMPT_VERSION = 'daily_tape_score_leader_v3';

export const TODAY_MOVEMENT_LLM_SYSTEM_PROMPT = `You are writing the Today’s Movement article for GoTango. Internally this feature may be called daily_tape, but that name should not appear in user-facing copy.

Write a fun, polished, destination-led daily read about what is moving today across GoTango destinations.

The article should be accessible to a broad audience. Do not assume the reader cares specifically about private aviation. Use arrival data and GoTango scores as context, but write about destination momentum, events, travel energy, seasonal movement, and what is worth watching.

Do not use the words or phrases:
- Daily Tape
- tape
- private travel
- private-travel
- private arrivals
- private arrival
- private-arrival (including compounds like private-arrival push or private-arrival depth)
- private aviation
unless quoting an existing UI label outside the generated article, which should generally be avoided.

Preferred language:
- arrivals
- observed arrivals
- arrival movement
- destination movement
- GoTango score
- GoTango signal
- destination momentum
- today’s read
- today’s take
- GoTango read
- travel signal
- momentum
- heating
- cooling
- holding rank
- keeping pace
- watch next
- what is building
- what is fading
- what is happening now
- what could happen next

GoTango Score leadership rule:
The GoTango Score is the primary durable destination ranking. Heating/cooling status is a momentum signal, not the ranking. Do not describe a destination as leading, out front, setting the pace, taking the top spot, owning the board, ranked first, or #1 unless it has the highest GoTango Score in the provided data. If a destination is heating but does not have the top GoTango Score, describe it as gaining momentum, heating up behind the leaders, keeping pace, climbing, or one to watch. Use the provided "GoTango Score leaders" list to decide who leads; use the "Heating momentum" list only to describe movement.

Headline rules:
The headline should be fun, specific, and destination-led, and it must respect the GoTango Score leadership rule.

The headline should NOT sound like:
“Private-travel tape is leaning into the summer leisure rotation...”
“Nassau leads the way...” (when Nassau is only heating and is not the top GoTango Score)

The headline SHOULD sound more like:
“Hamptons holds the top spot as Nassau heats up behind the leaders”
“Hamptons and Nantucket stay out front while Nassau gains momentum”
“Hamptons leads today’s GoTango read as Nassau, 30A, and Olbia heat up”
“Hamptons owns the top score, but Nassau is making the day more interesting”
“Beach weekends are winning today, but the mountain towns are starting to move”

Headline requirements:
- Under 130 characters when possible.
- Mention 1 to 4 destinations when supported by the data.
- Only the destination with the highest GoTango Score may be called the leader, out front, top spot, or the one setting the pace.
- A heating destination that is not the top GoTango Score should be framed as momentum (heating up, gaining momentum, keeping pace), never as the leader.
- Make it feel current and human.
- Make it sticky enough that a user wants to read more.
- Do not simply summarize numbers.
- Do not overclaim.
- Do not use “tape.”
- Do not use “private travel.”
- Do not use “private arrivals” or “private arrival.”

Article structure (4 paragraphs):
- Paragraph 1: What is happening today. Lead with the top GoTango Score destination(s), then describe heating destinations as momentum.
- Paragraph 2: What changed versus yesterday and the last few days.
- Paragraph 3: Why it may be happening. Use destination news blurbs where available.
- Paragraph 4 (Looking Forward): Explain what to watch over the next few days or weeks.

Looking Forward should:
- Pull from current destination news articles and destination news blurbs when available.
- Mention upcoming events, seasonal openings, festivals, hospitality programming, dining, nightlife, major weekends, or destination-specific momentum only when supported by available news.
- If news is missing, fall back to GoTango score movement, heating/cooling status, arrivals today vs yesterday, 3-day trend, and 7-day trend.
- Avoid inventing events.
- Avoid unsupported predictions.
- Use cautious but interesting language.

Additional rules:
- Write 8-12 sentences total across the four paragraphs.
- Always include a clear point of view.
- Mention uncertainty when the data looks noisy.
- Do not overclaim.
- Do not use “MATTERS” as a verdict label.
- Use “HEATING” as the primary positive verdict label.
- Avoid generic travel-writing clichés.

Return strict JSON:
{
  "headline": string,
  "verdict": "HEATING" | "WATCHING" | "COOLING" | "MIXED SIGNAL" | "QUIET",
  "confidence": "LOW" | "MEDIUM" | "HIGH",
  "paragraphs": string[],
  "signalChips": [
    {
      "label": string,
      "value": string,
      "tone": "heating" | "cooling" | "steady" | "neutral"
    }
  ],
  "drivers": [
    {
      "label": string,
      "value": string,
      "detail": string,
      "tone": "heating" | "cooling" | "steady" | "neutral"
    }
  ]
}`;

const VALID_VERDICTS = new Set(['HEATING', 'WATCHING', 'COOLING', 'MIXED SIGNAL', 'QUIET']);
const VALID_CONFIDENCE = new Set(['LOW', 'MEDIUM', 'HIGH']);
const VALID_TONES = new Set(['heating', 'cooling', 'steady', 'neutral']);

const FORBIDDEN_DAILY_TAPE_COPY_PATTERNS = [
  /\bdaily[\s-]tape\b/i,
  /\bprivate[\s-]travel tape\b/i,
  /\btravel tape\b/i,
  /\bthe tape\b/i,
  /\bprivate travel\b/i,
  /\bprivate-travel\b/i,
  /\bprivate arrivals\b/i,
  /\bprivate arrival\b/i,
  /\bprivate-arrival\b/i,
  /\bprivate aviation\b/i,
  /\btapes?\b/i,
];

export function findForbiddenDailyTapeCopyPhrases(text) {
  const haystack = String(text || '');
  const hits = [];
  for (const pattern of FORBIDDEN_DAILY_TAPE_COPY_PATTERNS) {
    const match = haystack.match(pattern);
    if (match) hits.push(match[0]);
  }
  return hits;
}

function collectForbiddenDailyTapeCopyFromDraft(draft) {
  const parts = [];
  if (draft?.headline) parts.push(String(draft.headline));
  if (Array.isArray(draft?.paragraphs)) {
    for (const p of draft.paragraphs) parts.push(String(p));
  }
  const hits = [];
  for (const part of parts) {
    for (const phrase of findForbiddenDailyTapeCopyPhrases(part)) {
      if (!hits.includes(phrase)) hits.push(phrase);
    }
  }
  return hits;
}

function escapeRegExpLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Leadership phrases that imply top ranking. Used to guard against describing a
// heating-but-not-top-score destination as the leader.
const LEADERSHIP_PHRASES = [
  'leads the way',
  'lead the way',
  'leads',
  'leading',
  'takes the lead',
  'take the lead',
  'took the lead',
  'sets the pace',
  'set the pace',
  'setting the pace',
  'out front',
  'top spot',
  'owns the board',
  'own the board',
  'ranked first',
  'grabs the top spot',
];

/**
 * Collects the destinations referenced in the article input along with their
 * GoTango Scores. Merges the score-leader list (primary ranking) with the
 * heating/cooling destinations so the highest score can be determined.
 */
export function collectScoredDailyTapeDestinations(input) {
  const byName = new Map();
  const add = (name, score) => {
    const cleanName = name != null ? String(name).trim() : '';
    if (!cleanName) return;
    const numeric = Number.isFinite(Number(score)) ? Number(score) : undefined;
    const key = cleanName.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, { name: cleanName, goTangoScore: numeric });
    } else if (numeric != null && (existing.goTangoScore == null || numeric > existing.goTangoScore)) {
      existing.goTangoScore = numeric;
    }
  };
  if (Array.isArray(input?.scoreLeaders)) {
    for (const d of input.scoreLeaders) add(d?.name, d?.goTangoScore);
  }
  if (Array.isArray(input?.destinations)) {
    for (const d of input.destinations) add(d?.name, d?.goTangoScore);
  }
  return [...byName.values()];
}

/**
 * Returns the GoTango Score leader entries (sorted by score descending). Falls
 * back to deriving leaders from the destination list when no explicit
 * scoreLeaders array is present (e.g. older inputs).
 */
export function getDailyTapeScoreLeaders(input) {
  if (Array.isArray(input?.scoreLeaders) && input.scoreLeaders.length) {
    return input.scoreLeaders
      .map((d) => ({
        name: d?.name != null ? String(d.name).trim() : '',
        goTangoScore: Number.isFinite(Number(d?.goTangoScore)) ? Number(d.goTangoScore) : undefined,
      }))
      .filter((d) => d.name)
      .sort((a, b) => (b.goTangoScore || 0) - (a.goTangoScore || 0));
  }
  return collectScoredDailyTapeDestinations(input)
    .filter((d) => d.goTangoScore != null)
    .sort((a, b) => (b.goTangoScore || 0) - (a.goTangoScore || 0));
}

/**
 * Finds destinations that are described with leadership phrasing but do not hold
 * the highest GoTango Score in the provided data. Used to reject/retry copy that
 * treats a heating destination as the ranking leader.
 */
export function findLeadershipMisattributions(text, input) {
  const haystack = String(text || '');
  if (!haystack.trim()) return [];
  const scored = collectScoredDailyTapeDestinations(input).filter((d) => d.goTangoScore != null);
  if (!scored.length) return [];
  const maxScore = Math.max(...scored.map((d) => d.goTangoScore));
  const topNames = new Set(
    scored.filter((d) => d.goTangoScore === maxScore).map((d) => d.name.toLowerCase()),
  );
  const allNames = [...new Set(collectScoredDailyTapeDestinations(input).map((d) => d.name).filter(Boolean))];
  const phraseAlternation = LEADERSHIP_PHRASES.map(escapeRegExpLiteral).join('|');
  const hits = [];
  for (const name of allNames) {
    if (topNames.has(name.toLowerCase())) continue;
    // Match "<destination> ... <leadership phrase>" within a short, same-sentence
    // window so we only flag leadership claims attached to this destination.
    const proximity = new RegExp(`${escapeRegExpLiteral(name)}[^.!?]{0,40}?(?:${phraseAlternation})`, 'i');
    if (proximity.test(haystack) && !hits.includes(name)) {
      hits.push(name);
    }
  }
  return hits;
}

export function getDailyTapeModel() {
  return process.env.DAILY_TAPE_MODEL
    || process.env.WEEKLY_BRIEF_MODEL
    || process.env.NEWS_CONTEXT_MODEL
    || 'gpt-5.4-mini';
}

function formatDailyTapeLeaderSections(input) {
  const lines = [];
  const leaders = getDailyTapeScoreLeaders(input).slice(0, 5);
  if (leaders.length) {
    lines.push('GoTango Score leaders (primary ranking — only the top score may be called the leader/out front/top spot):');
    leaders.forEach((d, i) => {
      lines.push(`${i + 1}. ${d.name}${d.goTangoScore != null ? ` — score ${d.goTangoScore}` : ''}`);
    });
    lines.push('');
  }

  const heating = Array.isArray(input?.destinations)
    ? input.destinations.filter((d) => d && d.status === 'heating')
    : [];
  if (heating.length) {
    lines.push('Heating momentum (describe as gaining momentum / heating up, NOT as leading unless also the top score):');
    heating.forEach((d) => {
      lines.push(`- ${d.name}${d.goTangoScore != null ? ` — score ${d.goTangoScore}` : ''} — heating up`);
    });
    lines.push('');
  }

  const cooling = Array.isArray(input?.destinations)
    ? input.destinations.filter((d) => d && d.status === 'cooling')
    : [];
  if (cooling.length) {
    lines.push('Cooling:');
    cooling.forEach((d) => {
      lines.push(`- ${d.name}${d.goTangoScore != null ? ` — score ${d.goTangoScore}` : ''} — cooling`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

export function buildDailyTapeUserMessage(input) {
  const leaderSections = formatDailyTapeLeaderSections(input);
  return `TODAY'S MOVEMENT INPUT:

${leaderSections}Full structured input (JSON):
${JSON.stringify(input, null, 2)}

Write today's Today’s Movement article from the input above. Use the GoTango Score leaders to decide who "leads"/"tops"/"sets the pace"; use heating status only to describe momentum. A heating destination that is not the top GoTango Score must not be described as leading. Return strict JSON only.`;
}

export function buildDailyTapePrompt(systemPrompt, input) {
  const sys = systemPrompt && String(systemPrompt).trim()
    ? String(systemPrompt).trim()
    : TODAY_MOVEMENT_LLM_SYSTEM_PROMPT;
  return `${sys}

---

${buildDailyTapeUserMessage(input)}`;
}

export function buildDailyTapeResponsesApiRequest(systemPrompt, input) {
  return {
    model: getDailyTapeModel(),
    store: false,
    reasoning: { effort: 'low' },
    text: { verbosity: 'medium' },
    max_output_tokens: Number(process.env.DAILY_TAPE_MAX_OUTPUT_TOKENS || 2200),
    input: buildDailyTapePrompt(systemPrompt, input),
  };
}

export function parseDailyTapeJsonFromModelText(text) {
  return parseBriefJsonFromModelText(text);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function validateChip(chip) {
  if (!chip || typeof chip !== 'object') return false;
  if (!isNonEmptyString(chip.label)) return false;
  if (chip.value == null || String(chip.value).trim() === '') return false;
  if (chip.tone != null && !VALID_TONES.has(chip.tone)) return false;
  return true;
}

function validateDriver(driver) {
  if (!driver || typeof driver !== 'object') return false;
  if (!isNonEmptyString(driver.label)) return false;
  if (!isNonEmptyString(driver.detail)) return false;
  if (driver.tone != null && !VALID_TONES.has(driver.tone)) return false;
  return true;
}

export function validateDailyTapeDraft(draft, input = null) {
  const errors = [];
  if (!draft || typeof draft !== 'object') {
    return { ok: false, errors: ['draft_missing'] };
  }

  if (!isNonEmptyString(draft.headline)) errors.push('missing_headline');

  const verdict = draft.verdict != null ? String(draft.verdict).trim() : '';
  if (!VALID_VERDICTS.has(verdict)) errors.push('invalid_verdict');
  if (verdict === 'MATTERS') errors.push('forbidden_verdict_matters');

  if (draft.confidence != null) {
    const conf = String(draft.confidence).trim();
    if (!VALID_CONFIDENCE.has(conf)) errors.push('invalid_confidence');
  }

  if (!Array.isArray(draft.paragraphs) || draft.paragraphs.length < 3 || draft.paragraphs.length > 5) {
    errors.push('paragraphs_count');
  } else {
    for (const p of draft.paragraphs) {
      if (!isNonEmptyString(p)) {
        errors.push('empty_paragraph');
        break;
      }
    }
  }

  if (draft.signalChips != null) {
    if (!Array.isArray(draft.signalChips)) {
      errors.push('invalid_signal_chips');
    } else {
      for (const chip of draft.signalChips) {
        if (!validateChip(chip)) {
          errors.push('invalid_signal_chip');
          break;
        }
      }
    }
  }

  if (!Array.isArray(draft.drivers) || draft.drivers.length < 2 || draft.drivers.length > 4) {
    errors.push('drivers_count');
  } else {
    for (const driver of draft.drivers) {
      if (!validateDriver(driver)) {
        errors.push('invalid_driver');
        break;
      }
    }
  }

  const forbiddenCopy = collectForbiddenDailyTapeCopyFromDraft(draft);
  if (forbiddenCopy.length) {
    errors.push(`forbidden_copy:${forbiddenCopy.join(',')}`);
  }

  // GoTango Score leadership guard: the headline and lead paragraph must not
  // describe a non-top-score destination as the leader. Only runs when score
  // context is supplied so existing callers without input keep their behavior.
  if (input && collectScoredDailyTapeDestinations(input).some((d) => d.goTangoScore != null)) {
    const leadParagraph = Array.isArray(draft.paragraphs) && draft.paragraphs.length
      ? String(draft.paragraphs[0])
      : '';
    const leadText = [draft.headline, leadParagraph].filter(Boolean).join('  ');
    const misattributed = findLeadershipMisattributions(leadText, input);
    if (misattributed.length) {
      errors.push(`leadership_misattribution:${misattributed.join(',')}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function buildSignalChipsFromInput(input) {
  const chips = [];
  const heating = Number(input?.heatingCount);
  const cooling = Number(input?.coolingCount);
  const destinations = Number(input?.destinationCount);
  const arrivals = Number(input?.privateArrivals24h);

  if (Number.isFinite(heating)) chips.push({ label: 'HEATING', value: String(heating), tone: 'heating' });
  if (Number.isFinite(cooling)) chips.push({ label: 'COOLING', value: String(cooling), tone: 'cooling' });
  if (Number.isFinite(destinations) && destinations > 0) {
    chips.push({ label: 'DESTINATIONS', value: String(destinations), tone: 'neutral' });
  }
  if (Number.isFinite(arrivals) && arrivals > 0) {
    chips.push({ label: 'ARRIVALS', value: String(Math.round(arrivals)), tone: 'steady' });
  }
  return chips;
}

export function normalizeDailyTapeBrief(draft, input, meta = {}) {
  const paragraphs = (draft.paragraphs || [])
    .map((p) => String(p).trim())
    .filter(Boolean);

  const signalChips = Array.isArray(draft.signalChips) && draft.signalChips.length
    ? draft.signalChips.map((chip) => ({
      label: String(chip.label).trim(),
      value: String(chip.value).trim(),
      tone: VALID_TONES.has(chip.tone) ? chip.tone : 'neutral',
    }))
    : buildSignalChipsFromInput(input);

  const drivers = (draft.drivers || []).map((driver) => ({
    label: String(driver.label).trim(),
    value: driver.value != null ? String(driver.value).trim() : undefined,
    detail: String(driver.detail).trim(),
    tone: VALID_TONES.has(driver.tone) ? driver.tone : 'neutral',
  }));

  const confidenceRaw = draft.confidence != null ? String(draft.confidence).trim() : 'MEDIUM';

  return {
    headline: String(draft.headline || "Today's Movement").trim(),
    verdict: String(draft.verdict).trim(),
    confidence: VALID_CONFIDENCE.has(confidenceRaw) ? confidenceRaw : 'MEDIUM',
    updatedLabel: input?.updatedAt ? String(input.updatedAt) : '',
    collapsedText: paragraphs.join(' '),
    paragraphs,
    signalChips,
    drivers,
    generator: meta.generator || 'daily-tape-llm',
  };
}

export function validateTodayMovementInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['input_missing'] };
  }
  if (!isNonEmptyString(input.todayDate)) errors.push('missing_today_date');
  if (!Number.isFinite(Number(input.destinationCount))) errors.push('missing_destination_count');
  if (!Number.isFinite(Number(input.heatingCount))) errors.push('missing_heating_count');
  if (!Number.isFinite(Number(input.coolingCount))) errors.push('missing_cooling_count');
  if (!Array.isArray(input.destinations)) errors.push('missing_destinations');
  return { ok: errors.length === 0, errors };
}

export async function enrichTodayMovementInputWithNewsFromKv(input, kvClient = kv, { limit = 5 } = {}) {
  if (!input || !Array.isArray(input.destinations) || !input.destinations.length) {
    return input;
  }

  const heating = input.destinations
    .filter((d) => d && d.status === 'heating')
    .sort((a, b) => (Number(b.goTangoScore) || 0) - (Number(a.goTangoScore) || 0))
    .slice(0, limit);

  if (!heating.length) return input;

  let latest = null;
  try {
    latest = await kvClient.get(NEWS_KV_KEYS.latest);
  } catch {
    return input;
  }

  const enrichedById = new Map();
  for (const dest of heating) {
    const entry = findLatestEntryForId(latest, dest.id);
    const news = buildBrowserSafeNewsPayload(entry, dest.id);
    if (!news) continue;

    const sourceHeadlines = (news.citations || [])
      .map((c) => (c?.title != null ? String(c.title).trim() : ''))
      .filter(Boolean);

    enrichedById.set(dest.id, {
      ...dest,
      aiNewsBlurb: news.blurb || dest.aiNewsBlurb,
      sourceHeadlines: sourceHeadlines.length ? sourceHeadlines : dest.sourceHeadlines,
    });
  }

  if (!enrichedById.size) return input;

  return {
    ...input,
    destinations: input.destinations.map((d) => enrichedById.get(d.id) || d),
  };
}

export async function callDailyTapeOpenAi({ systemPrompt, input, apiKey }) {
  const requestBody = buildDailyTapeResponsesApiRequest(systemPrompt, input);
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
  const draft = parseDailyTapeJsonFromModelText(text);
  if (!draft) {
    return { ok: false, error: 'Failed to parse Daily Tape JSON from model output', raw: text };
  }

  return { ok: true, draft, raw: text };
}

export async function generateDailyTapeBrief({
  input,
  systemPrompt = TODAY_MOVEMENT_LLM_SYSTEM_PROMPT,
  apiKey = process.env.OPENAI_API_KEY?.trim() || '',
  enrichNews = true,
  kvClient = kv,
}) {
  let llmError = null;
  let workingInput = input;

  if (enrichNews) {
    workingInput = await enrichTodayMovementInputWithNewsFromKv(workingInput, kvClient);
  }

  if (!apiKey) {
    return {
      ok: false,
      error: 'openai_api_key_missing',
      llm_error: 'openai_api_key_missing',
      input: workingInput,
    };
  }

  let result = await callDailyTapeOpenAi({
    systemPrompt,
    input: workingInput,
    apiKey,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error || 'llm_failed',
      llm_error: result.error || 'llm_failed',
      input: workingInput,
    };
  }

  let validation = validateDailyTapeDraft(result.draft, workingInput);
  const forbiddenCopy = validation.errors.find((e) => String(e).startsWith('forbidden_copy:'));
  const leadershipIssue = validation.errors.find((e) => String(e).startsWith('leadership_misattribution:'));
  if (!validation.ok && (forbiddenCopy || leadershipIssue)) {
    const corrections = [];
    if (forbiddenCopy) {
      corrections.push(`Your previous draft used banned user-facing wording (${forbiddenCopy.replace(/^forbidden_copy:/, '')}). Rewrite without Daily Tape, tape, private travel, private-travel, private arrivals, private arrival, private-arrival phrasing, or private aviation. Prefer arrivals, arrival movement, destination movement, GoTango score, and GoTango signal.`);
    }
    if (leadershipIssue) {
      const topLeaders = getDailyTapeScoreLeaders(workingInput)
        .slice(0, 3)
        .map((d) => `${d.name}${d.goTangoScore != null ? ` (score ${d.goTangoScore})` : ''}`)
        .join(', ');
      corrections.push(`Your previous draft described ${leadershipIssue.replace(/^leadership_misattribution:/, '')} as leading, but that destination is not the top GoTango Score. Only the highest GoTango Score destination may be called the leader, out front, top spot, or the one setting the pace. Current GoTango Score leaders: ${topLeaders}. Describe heating non-leaders as gaining momentum or heating up behind the leaders.`);
    }
    const retryPrompt = `${systemPrompt}

IMPORTANT RETRY: ${corrections.join(' ')} Keep the same JSON schema.`;
    result = await callDailyTapeOpenAi({
      systemPrompt: retryPrompt,
      input: workingInput,
      apiKey,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.error || 'llm_failed',
        llm_error: result.error || 'llm_failed',
        input: workingInput,
      };
    }
    validation = validateDailyTapeDraft(result.draft, workingInput);
  }

  if (!validation.ok) {
    llmError = `validation: ${validation.errors.join(', ')}`;
    return {
      ok: false,
      error: llmError,
      llm_error: llmError,
      input: workingInput,
    };
  }

  const brief = normalizeDailyTapeBrief(result.draft, workingInput, {
    generator: 'daily-tape-llm',
  });

  return {
    ok: true,
    brief,
    generator: 'daily-tape-llm',
    llm_error: null,
    input: workingInput,
  };
}

function dailyTapeUpdatedLabel(savedAt) {
  try {
    const d = savedAt ? new Date(savedAt) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const hh = String(d.getUTCHours()).padStart(2, '0');
    return `UPDATED ${hh}:00Z`;
  } catch {
    return '';
  }
}

/**
 * Builds the TodayMovementInput from cached arrivals + computed GoTango score,
 * mirroring the heating/cooling shortlists the Now page shows. Runs server-side
 * so the brief is generated once for everyone, not per user.
 */
export function buildTodayMovementInputFromSourceData({ arrivalsPayload, scoreResponse, homepage }) {
  const destinations = Array.isArray(scoreResponse?.destinations)
    ? scoreResponse.destinations
    : [];
  const minScore = Number.isFinite(Number(scoreResponse?.now_minimum_public_score))
    ? Number(scoreResponse.now_minimum_public_score)
    : NOW_MIN_PUBLIC_SCORE;

  const heating = destinations
    .filter((d) => d && d.now_heating_display_eligible && Number(d.go_tango_score) >= minScore)
    .sort((a, b) => (Number(b.go_tango_score) || 0) - (Number(a.go_tango_score) || 0));
  const cooling = destinations
    .filter((d) => d && d.now_cooling_display_eligible && Number(d.go_tango_score) >= minScore)
    .sort((a, b) => (Number(b.go_tango_score) || 0) - (Number(a.go_tango_score) || 0));

  const toInputDest = (d, status) => ({
    id: String(d.id || ''),
    name: String(d.name || d.id || ''),
    region: DAILY_TAPE_DESTINATION_REGION.get(d.id) || undefined,
    status,
    goTangoScore: Number.isFinite(Number(d.go_tango_score)) ? Number(d.go_tango_score) : undefined,
    scoreDelta3d: Number.isFinite(Number(d.activity_ratio)) ? Number(d.activity_ratio) : undefined,
    arrivalsToday: Number.isFinite(Number(d.raw_ga_arrivals_24h)) ? Number(d.raw_ga_arrivals_24h) : undefined,
  });

  const inputDestinations = [];
  // Cap leader names so the prompt stays focused; counts below use full lists.
  heating.slice(0, 6).forEach((d) => inputDestinations.push(toInputDest(d, 'heating')));
  cooling.slice(0, 4).forEach((d) => inputDestinations.push(toInputDest(d, 'cooling')));

  // GoTango Score leaders are the primary ranking signal (independent of
  // heating/cooling momentum). These let the writer decide who actually "leads"
  // rather than treating a heating destination as the leader.
  const scoreLeaders = destinations
    .filter((d) => d && Number.isFinite(Number(d.go_tango_score)) && Number(d.go_tango_score) >= minScore)
    .sort((a, b) => (Number(b.go_tango_score) || 0) - (Number(a.go_tango_score) || 0))
    .slice(0, 5)
    .map((d) => ({
      id: String(d.id || ''),
      name: String(d.name || d.id || ''),
      region: DAILY_TAPE_DESTINATION_REGION.get(d.id) || undefined,
      goTangoScore: Number.isFinite(Number(d.go_tango_score)) ? Number(d.go_tango_score) : undefined,
    }));

  const totals = homepage?.totals || (arrivalsPayload?.homepage && arrivalsPayload.homepage.totals);
  let privateArrivals24h;
  if (totals && Number.isFinite(Number(totals.total_private_arrivals_24h))) {
    privateArrivals24h = Number(totals.total_private_arrivals_24h);
  } else if (Number.isFinite(Number(arrivalsPayload?.total_arrivals_across_all))) {
    privateArrivals24h = Number(arrivalsPayload.total_arrivals_across_all);
  }

  const savedAt = arrivalsPayload?.saved_at || scoreResponse?.source_saved_at || null;

  return {
    todayDate: (savedAt ? String(savedAt) : new Date().toISOString()).slice(0, 10),
    updatedAt: dailyTapeUpdatedLabel(savedAt),
    destinationCount: Number(scoreResponse?.total_destinations) || destinations.length,
    heatingCount: heating.length,
    coolingCount: cooling.length,
    privateArrivals24h,
    scoreLeaders,
    destinations: inputDestinations,
  };
}

/**
 * Generates the Daily Tape brief from cached source data (cron path).
 * Returns the generated brief, the input used, and the arrivals snapshot the
 * brief was built from (used for once-per-snapshot idempotency).
 */
export async function buildDailyTapePackage(kvClient = kv, {
  systemPrompt = TODAY_MOVEMENT_LLM_SYSTEM_PROMPT,
  apiKey = process.env.OPENAI_API_KEY?.trim() || '',
} = {}) {
  const { arrivalsPayload, homepage, scoreResponse } = await loadBriefSourceDataFromKv(kvClient);
  const sourceSavedAt = arrivalsPayload?.saved_at || scoreResponse?.source_saved_at || null;
  const input = buildTodayMovementInputFromSourceData({ arrivalsPayload, scoreResponse, homepage });

  const result = await generateDailyTapeBrief({
    input,
    systemPrompt,
    apiKey,
    enrichNews: true,
    kvClient,
  });

  return { input, result, sourceSavedAt };
}

/**
 * Refresh orchestrator shared by the FlightAware pull and the daily cron.
 *
 * The brief is regenerated once per arrivals snapshot. Each saved record is
 * tagged with the arrivals `source_saved_at` and a `today_date`, and a non-forced
 * refresh is skipped when the cached brief already matches the current snapshot
 * OR is already for the same UTC day. The day-level check is a deliberate
 * belt-and-suspenders guard so the cron safety net never produces a second
 * article on a day the pull already generated one, even if the snapshot tag is
 * missing. `force` bypasses both checks.
 *
 * `loadSourceData` and `generate` are injectable for testing.
 */
export async function refreshDailyTapeCache(kvClient = kv, {
  force = false,
  systemPrompt = TODAY_MOVEMENT_LLM_SYSTEM_PROMPT,
  apiKey = process.env.OPENAI_API_KEY?.trim() || '',
  loadSourceData = loadBriefSourceDataFromKv,
  generate = generateDailyTapeBrief,
} = {}) {
  const { arrivalsPayload, homepage, scoreResponse } = await loadSourceData(kvClient);
  const sourceSavedAt = arrivalsPayload?.saved_at || scoreResponse?.source_saved_at || null;
  const todayDate = (sourceSavedAt ? String(sourceSavedAt) : new Date().toISOString()).slice(0, 10);

  if (!force) {
    const existing = await getDailyTapeFromKv(kvClient);
    if (existing.ok) {
      const sameSnapshot = Boolean(sourceSavedAt) && existing.source_saved_at === sourceSavedAt;
      const sameDay = Boolean(existing.today_date) && existing.today_date === todayDate;
      if (sameSnapshot || sameDay) {
        return {
          ok: true,
          skipped: true,
          reason: sameSnapshot ? 'already_generated_for_snapshot' : 'already_generated_today',
          source_saved_at: sourceSavedAt,
          today_date: todayDate,
          generator: existing.generator,
          brief: existing.brief,
        };
      }
    }
  }

  const input = buildTodayMovementInputFromSourceData({ arrivalsPayload, scoreResponse, homepage });
  const result = await generate({
    input,
    systemPrompt,
    apiKey,
    enrichNews: true,
    kvClient,
  });

  if (!result.ok) {
    return {
      ok: false,
      skipped: false,
      error: result.error,
      llm_error: result.llm_error,
      input,
      source_saved_at: sourceSavedAt,
    };
  }

  const record = await persistDailyTapeToKv(kvClient, {
    brief: result.brief,
    generator: result.generator,
    llmError: result.llm_error,
    todayDate: input.todayDate,
    sourceSavedAt,
  });

  return {
    ok: true,
    skipped: false,
    record,
    input,
    brief: result.brief,
    generator: result.generator,
    source_saved_at: sourceSavedAt,
  };
}

export async function persistDailyTapeToKv(kvClient, { brief, generator = 'daily-tape-llm', llmError = null, todayDate = null, sourceSavedAt = null }) {
  const savedAt = new Date().toISOString();
  const record = {
    saved_at: savedAt,
    today_date: todayDate || (brief && brief.todayDate) || savedAt.slice(0, 10),
    // Arrivals snapshot this brief was generated from; drives once-per-pull
    // idempotency so the same data never yields two different articles.
    source_saved_at: sourceSavedAt,
    generator,
    prompt_version: DAILY_TAPE_PROMPT_VERSION,
    llm_error: llmError,
    brief,
  };
  await kvClient.set(DAILY_TAPE_KV_KEYS.latest, record);
  return record;
}

export function readDailyTapeFromKvRecord(record) {
  if (!record || typeof record !== 'object' || !record.brief) {
    return { ok: false, error: 'empty' };
  }
  return {
    ok: true,
    saved_at: record.saved_at || null,
    today_date: record.today_date || null,
    source_saved_at: record.source_saved_at || null,
    generator: record.generator || null,
    llm_error: record.llm_error || null,
    brief: record.brief,
  };
}

export async function getDailyTapeFromKv(kvClient = kv) {
  const record = await kvClient.get(DAILY_TAPE_KV_KEYS.latest);
  return readDailyTapeFromKvRecord(record);
}
