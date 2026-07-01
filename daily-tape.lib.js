/**
 * Daily Tape — LLM prompt, validation, normalization, OpenAI synthesis,
 * server-side input building, and KV cache.
 *
 * Architecture: after the daily FlightAware pull and destination-news refresh,
 * /api/refresh-daily-tape generates the brief (triggered automatically when news
 * completes, with a late cron safety net) and saves to KV. /api/get-daily-tape
 * serves the cached brief to every user instantly (a single KV read, no per-user
 * AI call). The client keeps a deterministic builder for the brief that renders
 * before the cached brief arrives.
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

/** Matches the Now page In Season band (getGoTangoMomentumCategory score >= 70). */
export const NOW_IN_SEASON_MIN_SCORE = 70;
import {
  buildBrowserSafeNewsPayload,
  findLatestEntryForId,
} from './api/get-destination-news.js';
import {
  GOTANGO_VOICE_GUIDE,
  TODAYS_MOVEMENT_HUMAN_EDITOR_VOICE,
  DAILY_TAPE_GOTANGO_VOICE_REWRITE_INSTRUCTION,
  DAILY_TAPE_HUMAN_EDITOR_REWRITE_INSTRUCTION,
} from './gotango-voice.lib.js';

export {
  GOTANGO_VOICE_GUIDE,
  TODAYS_MOVEMENT_HUMAN_EDITOR_VOICE,
  DAILY_TAPE_GOTANGO_VOICE_REWRITE_INSTRUCTION,
  DAILY_TAPE_HUMAN_EDITOR_REWRITE_INSTRUCTION,
};

export const DAILY_TAPE_KV_KEYS = {
  latest: 'gotango:daily-tape:latest',
};

const DAILY_TAPE_DESTINATION_REGION = new Map(
  DESTINATIONS.map((d) => [d.id, d.region]),
);

export const DAILY_TAPE_PROMPT_VERSION = 'daily_tape_human_editor_v5';

export const TODAY_MOVEMENT_LLM_SYSTEM_PROMPT = `${GOTANGO_VOICE_GUIDE}

${TODAYS_MOVEMENT_HUMAN_EDITOR_VOICE}

---

You are writing Today’s Movement for GoTango. Internally this feature may be called daily_tape, but that name should not appear in user-facing copy.

Your job is not to summarize the data mechanically. Your job is to decide the most interesting destination story of the day and turn it into a short, natural, destination-led read.

Human-editor rule:
Write the article like a sharp GoTango editor, not like a metrics translation layer. The data is the evidence, not the story. Start with the day’s tension, then use the numbers and news to support it.

The article should answer:
- Who is still the name to beat?
- Who is making the board more interesting?
- Is the move broad or isolated?
- What explains it?
- What is the next question?

Do not open with:
- “Today’s movement…”
- “The data shows…”
- “[Destination] holds the highest GoTango Score…”
- “The overall read…”
- “The signal…”

Better openings:
- “Hamptons is still the name to beat, but Nassau is making today’s board more interesting.”
- “The East End is still in control, but the island names are getting louder.”
- “Hamptons and Nantucket are not giving up the top of the board, but the chase group is starting to move.”
- “The summer board has a little drama today: the leaders are steady, and the challengers are getting louder.”
- “30A has the weekend rhythm, Olbia has the calendar, and Hamptons still has the crown.”

Use GoTango Score as the durable ranking signal.
Use heating/cooling as momentum.
Use arrivals as supporting context.
Use destination news to explain why movement may be happening.
Use upcoming news or current destination context to explain what to watch next.

Write for a broad audience. The reader does not need to care about aviation. They care about where the world feels active, stylish, seasonal, surprising, or worth watching.

Before writing, choose one editorial angle:
- A score leader is holding the top spot
- A lower-ranked destination is gaining momentum
- Beach destinations are leading
- Mountain destinations are waking up
- Events are driving the movement
- The board is broadening
- The signal is mixed or noisy
- A recent hot spot is cooling
- A destination is moving before the story catches up

Do not say the editorial angle out loud unless it naturally belongs in the article. Use it to shape the writing.

Do not use the words or phrases:
- Daily Tape
- daily tape
- tape
- private travel
- private-travel
- private arrivals
- private arrival
- private-arrival (including compounds like private-arrival push or private-arrival depth)
- private aviation
- the tape
- travel tape
unless quoting an existing UI label outside the generated article, which should generally be avoided.

GoTango Score leadership rule:
The GoTango Score is the primary durable destination ranking. Heating/cooling status is a momentum signal, not the ranking. Do not describe a destination as leading, out front, setting the pace, taking the top spot, owning the board, ranked first, or #1 unless it has the highest GoTango Score in the provided data. If a destination is heating but does not have the top GoTango Score, describe it as gaining momentum, heating up behind the leaders, keeping pace, climbing, or one to watch. Use the provided "GoTango Score leaders" list to decide who leads; use the "Heating momentum" list only to describe movement.

Headline rules:
The headline must contain a relationship or tension, not just a list. It must respect the GoTango Score leadership rule.

Good headline patterns:
- “[Leader] is still the name to beat, but [challenger] is making the day interesting”
- “[Leader] holds the crown while [momentum names] turn up the heat”
- “[Leader] stays in front, but the summer chase pack is getting louder”
- “[Leader] leads the board as [challenger] starts to climb”
- “[Region/cluster] stays on top while [new cluster] wakes up”
- “[Leader] keeps the crown, but [destination] gives today’s read a spark”

Good headline examples:
- Hamptons is still the name to beat, but Nassau is making the day interesting
- Hamptons holds the crown while Nassau, Olbia, and 30A turn up the heat
- The East End stays on top, but the island names are getting louder
- Hamptons leads the board as Nassau and Olbia make their move
- Hamptons stays in front, but the summer chase pack is getting louder
- Nantucket keeps pressure on Hamptons while Nassau starts to climb

Bad headline examples:
- Hamptons stays on top as Nassau, Sardinia / Olbia and 30A keep heating up
- Today’s movement is broad across several destinations
- Hamptons has the highest GoTango Score while other destinations are heating
- The signal is durable across the top score leaders
- Fourteen of 51 destinations are heating today
- Nassau leads the way when Nassau does not have the highest GoTango Score

Headline requirements:
- Must be accurate to GoTango Score leadership.
- Must not imply a lower-score heating destination is the leader.
- Must include a relationship or tension.
- Under 130 characters when possible.
- Mention no more than 3 destination names unless absolutely necessary.
- Should sound like a human editor wrote it.
- Do not start with “Today’s movement.”

Article structure (4 short paragraphs):
- Paragraph 1: Open with the story tension, not the metric. Name the true GoTango Score leader in natural language and introduce the main challenger or momentum group.
- Paragraph 2: Explain whether the movement is broad, isolated, noisy, or meaningful. Use only one or two numbers if helpful. Do not overload the paragraph with metrics.
- Paragraph 3: Explain why the movement may be happening using destination news, events, seasonal programming, hospitality, dining, music, nightlife, or calendar context where available. Give destinations roles instead of listing them mechanically.
- Paragraph 4 (Looking Forward): Ask the next question. Explain what to watch over the next few days or weeks. Do not overclaim or invent events.

First paragraph rules:
- Do not start with “Hamptons still holds the highest GoTango Score…”
- Do not start with “Today’s read…”
- Do not start with a number.
- Do not mention more than 4 destinations.
- Make the sentence feel human.

Better first paragraph example:
“Hamptons is still the name to beat, with Nantucket close enough to keep pressure on the top of the board. But the spark today is coming from the chase group: Nassau, Olbia, and 30A are heating up behind the leaders, giving the day more movement than the ranking alone would suggest.”

Second paragraph example:
“This is not just one place having a good day. Fourteen of 51 destinations are heating, and the strength is showing up across different kinds of summer trips: island weekends, Gulf Coast energy, Mediterranean calendar pull, and mountain towns starting to wake up for July.”

Third paragraph example:
“The calendar helps explain why. Olbia has music and Gallura programming giving north-east Sardinia a louder summer story, while 30A keeps stacking the kind of weekend mix that makes a beach destination feel busy before dinner even starts. Jackson Hole adds another lane, with festivals, live music, arts programming, and outdoor events giving the mountains a reason to stay in the conversation.”

Fourth paragraph example:
“The next question is whether the challengers stay hot long enough to move the order. Hamptons does not need a breakout to stay interesting — it already owns the top score — but Nassau, Olbia, and 30A are the names to watch if today’s momentum keeps building into the next few weeks.”

Looking Forward should:
- Use current destination news and upcoming events when available.
- Mention festivals, openings, dining, nightlife, hospitality programming, major weekends, or seasonal context only when supported by the provided news.
- If news is thin, fall back to GoTango Score, score trend, heating/cooling status, and arrival movement.
- Do not invent events.
- Do not invent dates.
- Do not overclaim causality.

Tone examples:
Boring: Hamptons has the highest GoTango Score today, while Nassau is heating up and several other destinations have positive momentum.
Better: Hamptons is still the name to beat, but Nassau is making today’s board more interesting. The top names are not giving up ground, while the chase group is starting to spread into islands, beach weekends, and mountain towns.

Boring: There are 14 heating destinations and 51 total destinations.
Better: The board has real breadth today: 14 of 51 destinations are heating, which makes the move feel less like one place having a good day and more like a wider summer build.

Boring: The signal is durable.
Better: This feels more real than noisy.

Boring: Jackson Hole has festival events coming up.
Better: Jackson Hole is starting to look less like a quiet mountain hold and more like a July watch-list name, with festival energy and summer programming giving it a reason to keep climbing.

Additional rules:
- Write 8-12 sentences total across the four paragraphs.
- Always include a clear point of view.
- The final article should feel natural, not like a report.
- Mention uncertainty when the data looks noisy.
- Do not overclaim.
- Do not use “MATTERS” as a verdict label.
- Use “HEATING” as the primary positive verdict label.
- Always include 2 to 4 signalChips and 2 to 4 driver cards in the JSON, even though the page may not display them.

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

const BORING_HEADLINE_OPENERS = /^today['’]s movement\b/i;
const BORING_BODY_OPENERS = [
  /^several destinations\b/i,
  /^there are \d+/i,
  /showing positive movement/i,
  /is broad across several destinations/i,
  /^today['’]s read\b/i,
  /^today['’]s movement\b/i,
  /^the overall read\b/i,
  /^the signal\b/i,
  /^.+ still holds the highest GoTango Score\b/i,
  /^\d/,
];
const CLINICAL_PHRASE_PATTERNS = [
  /\bdestination momentum\b/gi,
  /\bobserved arrivals\b/gi,
  /\bone-destination spike\b/gi,
  /\bscore base\b/gi,
  /\bscore leaders\b/gi,
  /\bbiggest gainers\b/gi,
  /\bheating list\b/gi,
  /\bcleaner read\b/gi,
  /\bnear-term calendar\b/gi,
  /\bbigger score move\b/gi,
  /\bthe signal is durable\b/gi,
  /\bthe overall read\b/gi,
];
const LOOKING_FORWARD_PATTERN = /\b(looking forward|what to watch|the next question|watch (whether|for|next)|over the next (few )?(days|weeks)|next few weeks)\b/i;
const MECHANICAL_LIST_PATTERN = /(?:^|\n)\s*[-•]\s+.+(\n\s*[-•]\s+.+){2,}/m;
const HEADLINE_LIST_PATTERN = /\bstays on top as\b.+\b(keep|keeps) heating up\b/i;
const HEADLINE_NO_TENSION_PATTERN = /\bholds the (top spot|top score|highest GoTango Score)\b/i;

/**
 * Collects destination names from the article input for naturalness checks.
 */
export function collectDailyTapeDestinationNames(input) {
  return [...new Set(
    collectScoredDailyTapeDestinations(input).map((d) => d.name).filter(Boolean),
  )];
}

function headlineIsMostlyNumbers(headline) {
  const text = String(headline || '').trim();
  if (!text) return false;
  const digits = (text.match(/\d/g) || []).length;
  return digits / text.length > 0.4;
}

function headlineMentionsDestination(headline, input) {
  const haystack = String(headline || '').toLowerCase();
  const names = collectDailyTapeDestinationNames(input);
  return names.some((name) => haystack.includes(name.toLowerCase()));
}

function bodyHasLookingForward(paragraphs) {
  const text = (Array.isArray(paragraphs) ? paragraphs : []).join(' ');
  return LOOKING_FORWARD_PATTERN.test(text);
}

function bodyReadsMechanical(paragraphs) {
  const text = (Array.isArray(paragraphs) ? paragraphs : []).join('\n');
  if (MECHANICAL_LIST_PATTERN.test(text)) return true;
  if (/\d+ destinations are heating/i.test(text) && /\d+ total destinations/i.test(text)) return true;
  if (/\d+ of \d+ destinations are heating/i.test(text) && !/board has real breadth|wider summer build|less like a one-place spike/i.test(text)) {
    return true;
  }
  return false;
}

function bodyLacksPointOfView(paragraphs) {
  const lead = Array.isArray(paragraphs) && paragraphs.length ? String(paragraphs[0]) : '';
  return BORING_BODY_OPENERS.some((pattern) => pattern.test(lead.trim()));
}

function headlineLacksRelationship(headline) {
  const h = String(headline || '').trim();
  if (!h) return false;
  if (HEADLINE_LIST_PATTERN.test(h)) return true;
  const tension = /\b(but|while|name to beat|crown|interesting|louder|drama|chase|spark|pressure|making the day|making today['’]s board|turn up the heat|getting louder|wake up|wakes up|make their move)\b/i;
  if (HEADLINE_NO_TENSION_PATTERN.test(h) && !tension.test(h) && /\b(heat|gain|gaining)\b/i.test(h)) {
    return true;
  }
  return false;
}

function countClinicalPhrases(text) {
  let count = 0;
  for (const pattern of CLINICAL_PHRASE_PATTERNS) {
    const matches = String(text || '').match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

function countPhraseOccurrences(text, pattern) {
  return (String(text || '').match(pattern) || []).length;
}

function countDestinationsInParagraph(paragraph, input) {
  const haystack = String(paragraph || '').toLowerCase();
  const names = collectDailyTapeDestinationNames(input);
  let count = 0;
  for (const name of names) {
    if (haystack.includes(name.toLowerCase())) count += 1;
  }
  return count;
}

function bodyUsesTooManyClinicalTerms(paragraphs) {
  const text = (Array.isArray(paragraphs) ? paragraphs : []).join(' ');
  if (countClinicalPhrases(text) >= 3) return true;
  if (countPhraseOccurrences(text, /\bthe signal\b/gi) > 1) return true;
  if (countPhraseOccurrences(text, /\bdestination momentum\b/gi) > 1) return true;
  if (countPhraseOccurrences(text, /\bscore\b/gi) > 5) return true;
  if (/\bobserved arrivals\b/i.test(text)) return true;
  return false;
}

/**
 * Flags generated copy that reads too mechanical or generic for GoTango voice.
 * Used to trigger a single rewrite pass without changing cache mechanics.
 */
export function findBoringDailyTapeCopyIssues(draft, input = null) {
  const issues = [];
  const headline = String(draft?.headline || '').trim();
  const paragraphs = Array.isArray(draft?.paragraphs) ? draft.paragraphs : [];

  if (headline && BORING_HEADLINE_OPENERS.test(headline)) {
    issues.push('boring_headline_opener');
  }
  if (headline && headlineIsMostlyNumbers(headline)) {
    issues.push('boring_headline_mostly_numbers');
  }
  if (headline && headlineLacksRelationship(headline)) {
    issues.push('boring_headline_no_relationship');
  }
  if (input && headline && !headlineMentionsDestination(headline, input)) {
    issues.push('boring_headline_no_destinations');
  }
  if (paragraphs.length && bodyLacksPointOfView(paragraphs)) {
    issues.push('boring_body_no_point_of_view');
  }
  if (paragraphs.length && !bodyHasLookingForward(paragraphs)) {
    issues.push('boring_body_no_looking_forward');
  }
  if (paragraphs.length && bodyReadsMechanical(paragraphs)) {
    issues.push('boring_body_mechanical_list');
  }
  if (paragraphs.length && bodyUsesTooManyClinicalTerms(paragraphs)) {
    issues.push('boring_body_clinical_terms');
  }
  if (input && paragraphs.length && countDestinationsInParagraph(paragraphs[0], input) > 4) {
    issues.push('boring_lead_too_many_destinations');
  }

  const forbiddenCopy = collectForbiddenDailyTapeCopyFromDraft(draft);
  if (forbiddenCopy.length) {
    issues.push(`forbidden_copy:${forbiddenCopy.join(',')}`);
  }

  if (input && collectScoredDailyTapeDestinations(input).some((d) => d.goTangoScore != null)) {
    const leadParagraph = paragraphs.length ? String(paragraphs[0]) : '';
    const leadText = [headline, leadParagraph].filter(Boolean).join('  ');
    const misattributed = findLeadershipMisattributions(leadText, input);
    if (misattributed.length) {
      issues.push(`leadership_misattribution:${misattributed.join(',')}`);
    }
  }

  return issues;
}

export function isBoringDailyTapeDraft(draft, input = null) {
  return findBoringDailyTapeCopyIssues(draft, input).length > 0;
}

export function getDailyTapeModel() {
  return process.env.DAILY_TAPE_MODEL
    || process.env.WEEKLY_BRIEF_MODEL
    || process.env.NEWS_CONTEXT_MODEL
    || 'gpt-5.4-mini';
}

function formatDestinationNewsHooks(destinations) {
  const lines = [];
  const withNews = (destinations || []).filter(
    (d) => d && (d.aiNewsBlurb || (Array.isArray(d.sourceHeadlines) && d.sourceHeadlines.length)),
  );
  if (!withNews.length) return '';
  lines.push('Destination news hooks (explain why movement may be happening):');
  for (const d of withNews) {
    const parts = [`- ${d.name}`];
    if (d.aiNewsBlurb) parts.push(`blurb: ${String(d.aiNewsBlurb).trim()}`);
    if (Array.isArray(d.sourceHeadlines) && d.sourceHeadlines.length) {
      parts.push(`headlines: ${d.sourceHeadlines.slice(0, 3).join(' · ')}`);
    }
    lines.push(parts.join(' — '));
  }
  lines.push('');
  return lines.join('\n');
}

const UPCOMING_HOOK_PATTERN = /\b(upcoming|festival|opening|programming|this weekend|next week|july|august|season|event)\b/i;

function destinationHasNews(d) {
  return Boolean(
    d && (d.aiNewsBlurb || (Array.isArray(d.sourceHeadlines) && d.sourceHeadlines.length)),
  );
}

function destinationHasUpcomingHook(d) {
  if (!d) return false;
  const candidates = [];
  if (d.aiNewsBlurb) candidates.push(String(d.aiNewsBlurb));
  if (Array.isArray(d.sourceHeadlines)) candidates.push(...d.sourceHeadlines.map(String));
  return candidates.some((text) => UPCOMING_HOOK_PATTERN.test(text));
}

/**
 * Classifies existing input data into editorial destination roles for the LLM.
 * Does not change scoring or heating/cooling logic.
 */
export function buildDailyTapeDestinationRoles(input) {
  const leaders = getDailyTapeScoreLeaders(input);
  const leader = leaders[0] || null;
  const leaderKey = leader?.name ? leader.name.toLowerCase() : '';
  const pressure = leaders.slice(1, 3);
  const allDests = Array.isArray(input?.destinations) ? input.destinations : [];

  const momentumStories = allDests.filter(
    (d) => d && d.status === 'heating' && d.name && d.name.toLowerCase() !== leaderKey,
  );

  const calendarStories = allDests.filter(
    (d) => destinationHasNews(d) && (destinationHasUpcomingHook(d) || d.status === 'heating'),
  );

  const watchList = allDests.filter(
    (d) => d && d.status === 'heating' && d.name && d.name.toLowerCase() !== leaderKey,
  ).slice(0, 5);

  const coolingStories = allDests.filter((d) => d && d.status === 'cooling');

  return {
    leader,
    pressure,
    momentumStories,
    calendarStories,
    watchList,
    coolingStories,
  };
}

function formatDestinationRolesSection(input) {
  const roles = buildDailyTapeDestinationRoles(input);
  const lines = ['Destination roles (use to write more naturally — do not list mechanically in the article):'];

  if (roles.leader?.name) {
    lines.push(`- Leader: ${roles.leader.name} — highest GoTango Score${roles.leader.goTangoScore != null ? ` (${roles.leader.goTangoScore})` : ''}`);
  }
  if (roles.pressure.length) {
    lines.push(`- Pressure: ${roles.pressure.map((d) => d.name).join(', ')} — close behind by score`);
  }
  if (roles.momentumStories.length) {
    lines.push(`- Momentum stories: ${roles.momentumStories.map((d) => d.name).join(', ')} — heating behind the leaders`);
  }
  if (roles.calendarStories.length) {
    lines.push(`- Calendar stories: ${roles.calendarStories.map((d) => d.name).join(', ')} — news/events support the movement`);
  }
  if (roles.watchList.length) {
    lines.push(`- Watch list: ${roles.watchList.map((d) => d.name).join(', ')} — worth monitoring if momentum holds`);
  }
  if (roles.coolingStories.length) {
    lines.push(`- Cooling stories: ${roles.coolingStories.map((d) => d.name).join(', ')} — losing momentum`);
  }

  if (lines.length === 1) return '';
  lines.push('');
  return lines.join('\n');
}

function formatUpcomingHooks(destinations) {
  const lines = [];
  const hooks = [];
  for (const d of destinations || []) {
    if (!d) continue;
    const candidates = [];
    if (d.aiNewsBlurb) candidates.push(String(d.aiNewsBlurb));
    if (Array.isArray(d.sourceHeadlines)) candidates.push(...d.sourceHeadlines.map(String));
    for (const text of candidates) {
      if (UPCOMING_HOOK_PATTERN.test(text)) {
        hooks.push(`- ${d.name}: ${text.trim().slice(0, 200)}`);
        break;
      }
    }
  }
  if (!hooks.length) return '';
  lines.push('Upcoming / forward-looking hooks (inform Looking Forward — do not invent beyond these):');
  lines.push(...hooks);
  lines.push('');
  return lines.join('\n');
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

  const allDests = Array.isArray(input?.destinations) ? input.destinations : [];

  const heating = allDests.filter((d) => d && d.status === 'heating');
  if (heating.length) {
    lines.push('Heating momentum (describe as gaining momentum / heating up, NOT as leading unless also the top score):');
    heating.forEach((d) => {
      lines.push(`- ${d.name}${d.goTangoScore != null ? ` — score ${d.goTangoScore}` : ''} — heating up`);
    });
    lines.push('');
  }

  const cooling = allDests.filter((d) => d && d.status === 'cooling');
  if (cooling.length) {
    lines.push('Cooling destinations:');
    cooling.forEach((d) => {
      lines.push(`- ${d.name}${d.goTangoScore != null ? ` — score ${d.goTangoScore}` : ''} — cooling`);
    });
    lines.push('');
  }

  const gainers = allDests
    .filter((d) => Number.isFinite(Number(d.scoreDelta3d)) && Number(d.scoreDelta3d) > 0)
    .sort((a, b) => Number(b.scoreDelta3d) - Number(a.scoreDelta3d))
    .slice(0, 5);
  if (gainers.length) {
    lines.push('Biggest score gainers:');
    gainers.forEach((d) => {
      lines.push(`- ${d.name} — score delta 3d: +${Number(d.scoreDelta3d)}`);
    });
    lines.push('');
  }

  const arrivalMovers = allDests
    .filter((d) => Number.isFinite(Number(d.arrivalsToday)) && Number(d.arrivalsToday) > 0)
    .sort((a, b) => Number(b.arrivalsToday) - Number(a.arrivalsToday))
    .slice(0, 5);
  if (arrivalMovers.length) {
    lines.push('Arrival movement (supporting context):');
    arrivalMovers.forEach((d) => {
      lines.push(`- ${d.name} — arrivals today: ${Number(d.arrivalsToday)}`);
    });
    lines.push('');
  }

  const newsSection = formatDestinationNewsHooks(allDests);
  if (newsSection) lines.push(newsSection);

  const upcomingSection = formatUpcomingHooks(allDests);
  if (upcomingSection) lines.push(upcomingSection);

  return lines.join('\n');
}

function formatFeaturedDestinationSection(input) {
  const id = input?.primaryDestinationId ? String(input.primaryDestinationId).trim() : '';
  const name = input?.primaryDestinationName ? String(input.primaryDestinationName).trim() : '';
  if (!id && !name) return '';
  const score = Number.isFinite(Number(input?.primaryDestinationScore))
    ? ` (GoTango Score ${Number(input.primaryDestinationScore)})`
    : '';
  return `Featured destination (top In Season on the Now board — Today's Movement hero image anchor):
- ${name || id}${score}
- destination id: ${id || 'n/a'}
Open with this destination's role in today's board. The headline and opening tension should feel visually aligned with this place while still respecting GoTango Score leadership rules below.

`;
}

export function getTopInSeasonLeader(destinations) {
  const list = Array.isArray(destinations) ? destinations : [];
  const inSeason = list
    .filter((d) => d && Number.isFinite(Number(d.go_tango_score)) && Number(d.go_tango_score) >= NOW_IN_SEASON_MIN_SCORE)
    .sort((a, b) => {
      const scoreDiff = (Number(b.go_tango_score) || 0) - (Number(a.go_tango_score) || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
  const top = inSeason[0];
  if (!top) return null;
  return {
    id: String(top.id || ''),
    name: String(top.name || top.id || ''),
    goTangoScore: Number.isFinite(Number(top.go_tango_score)) ? Number(top.go_tango_score) : undefined,
  };
}

export function buildDailyTapeUserMessage(input) {
  const featuredSection = formatFeaturedDestinationSection(input);
  const leaderSections = formatDailyTapeLeaderSections(input);
  const rolesSection = formatDestinationRolesSection(input);
  return `TODAY'S MOVEMENT INPUT:

Evidence hierarchy (read in this order):
0. Featured destination (top In Season) anchors the hero image — make the read feel aligned with that place.
1. GoTango Score leaders determine who leads.
2. Heating names determine who is gaining momentum.
3. Cooling destinations show where momentum is fading.
4. Biggest score gainers show who is climbing fastest.
5. Arrival movement adds supporting context.
6. Destination news hooks explain why movement may be happening.
7. Upcoming hooks inform Looking Forward.
8. Destination roles help you write with tension and cast logic.
9. Full structured JSON below for any additional fields.

${featuredSection}${leaderSections}${rolesSection}Full structured input (JSON):
${JSON.stringify(input, null, 2)}

---

GoTango Voice guidance:
${GOTANGO_VOICE_GUIDE}

${TODAYS_MOVEMENT_HUMAN_EDITOR_VOICE}

Write today's Today’s Movement article from the input above. Start with the day’s tension, not the metric. Use destination roles to give each place a part in the story. Use the GoTango Score leaders to decide who is the name to beat; use heating status only to describe challengers and momentum. A heating destination that is not the top GoTango Score must not be described as leading. Include a clear Looking Forward paragraph (paragraph 4) that asks the next question. Return strict JSON only.`;
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

/**
 * Deterministically builds 2 valid driver cards from the input. Used as a
 * repair fallback when the model omits or malforms the `drivers` array. Drivers
 * are internal metadata (not rendered on the Now page), so they must never be
 * the reason an otherwise-valid article is discarded.
 */
export function buildDriversFromInput(input, draft = null) {
  const heatingCount = Number(input?.heatingCount);
  const coolingCount = Number(input?.coolingCount);
  const heatingBroad = Number.isFinite(heatingCount) && heatingCount >= 3;
  const drivers = [{
    label: 'BREADTH',
    value: heatingBroad ? 'WIDER HEAT' : 'CONCENTRATED',
    detail: heatingBroad
      ? 'More than one cluster is participating, so the move is broader than a single destination.'
      : 'A short list of names is doing most of the lifting for now.',
    tone: heatingBroad ? 'heating' : 'steady',
  }];

  const verdict = draft?.verdict != null ? String(draft.verdict).trim() : '';
  const coolingLeads = Number.isFinite(coolingCount) && Number.isFinite(heatingCount) && coolingCount > heatingCount;
  if (verdict === 'COOLING' || coolingLeads) {
    drivers.push({
      label: 'CAVEAT',
      value: 'PEAK FADE',
      detail: 'Some cooling is the high-season rush peaking on schedule rather than lost interest.',
      tone: 'cooling',
    });
  } else {
    drivers.push({
      label: 'WATCH NEXT',
      value: 'HOLDING RANK',
      detail: 'The next signal is whether today’s names stay elevated tomorrow or fade.',
      tone: 'neutral',
    });
  }
  return drivers;
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
    primaryDestinationId: input?.primaryDestinationId ? String(input.primaryDestinationId) : undefined,
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
  const boringIssues = findBoringDailyTapeCopyIssues(result.draft, workingInput);
  const forbiddenCopy = validation.errors.find((e) => String(e).startsWith('forbidden_copy:'));
  const leadershipIssue = validation.errors.find((e) => String(e).startsWith('leadership_misattribution:'));
  const needsRetry = (!validation.ok && (forbiddenCopy || leadershipIssue))
    || boringIssues.length > 0;

  if (needsRetry) {
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
    if (boringIssues.length) {
      corrections.push(DAILY_TAPE_HUMAN_EDITOR_REWRITE_INSTRUCTION);
      corrections.push(`Issues to fix: ${boringIssues.join(', ')}.`);
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

  // Drivers and signal chips are internal metadata the Now page does not render
  // (the section shows only the headline and the read). A flaky model miss on
  // these arrays must never discard an otherwise-valid article, so when the ONLY
  // remaining issues are these recoverable metadata arrays, repair them
  // deterministically from the input rather than failing the whole generation.
  if (!validation.ok) {
    const RECOVERABLE_METADATA_ERRORS = new Set([
      'drivers_count',
      'invalid_driver',
      'invalid_signal_chips',
      'invalid_signal_chip',
    ]);
    const onlyMetadataIssues = validation.errors.length > 0
      && validation.errors.every((e) => RECOVERABLE_METADATA_ERRORS.has(String(e)));
    if (onlyMetadataIssues) {
      result.draft.drivers = buildDriversFromInput(workingInput, result.draft);
      result.draft.signalChips = buildSignalChipsFromInput(workingInput);
      validation = validateDailyTapeDraft(result.draft, workingInput);
    }
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

  // Heating/cooling here must match what the Now hero bar and Movers page show
  // the reader: both count every destination whose confirmed momentum category
  // is heating_up / cooling (assignMoverSectionsV2 + _buildNowHeatingShortlist
  // in index.html, mirrored client-side by buildTodayMovementInputFromPage).
  // The earlier now_*_display_eligible filter was a stricter subset, so the
  // article claimed fewer heating destinations than the hero bar (e.g. "5 of
  // 51" while the bar showed 10). Within the named list we still surface the
  // actively-moving (display-eligible) names first so the prose leads with the
  // most prominent movers, then fall back to GoTango Score order.
  const byScoreDesc = (a, b) => (Number(b.go_tango_score) || 0) - (Number(a.go_tango_score) || 0);
  const eligibleFirst = (eligibleKey) => (a, b) => {
    const aEligible = a && a[eligibleKey] ? 1 : 0;
    const bEligible = b && b[eligibleKey] ? 1 : 0;
    if (aEligible !== bEligible) return bEligible - aEligible;
    return byScoreDesc(a, b);
  };
  const heating = destinations
    .filter((d) => d && d.confirmed_category === 'heating_up')
    .sort(eligibleFirst('now_heating_display_eligible'));
  const cooling = destinations
    .filter((d) => d && d.confirmed_category === 'cooling')
    .sort(eligibleFirst('now_cooling_display_eligible'));

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
  const topInSeason = getTopInSeasonLeader(destinations);

  return {
    todayDate: (savedAt ? String(savedAt) : new Date().toISOString()).slice(0, 10),
    updatedAt: dailyTapeUpdatedLabel(savedAt),
    sourceSavedAt: savedAt ? String(savedAt) : undefined,
    destinationCount: Number(scoreResponse?.total_destinations) || destinations.length,
    heatingCount: heating.length,
    coolingCount: cooling.length,
    privateArrivals24h,
    scoreLeaders,
    destinations: inputDestinations,
    primaryDestinationId: topInSeason?.id || undefined,
    primaryDestinationName: topInSeason?.name || undefined,
    primaryDestinationScore: topInSeason?.goTangoScore,
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
 * Refresh orchestrator shared by the post-news trigger and the late cron safety net.
 *
 * The brief is regenerated once per arrivals snapshot. Each saved record is
 * tagged with the arrivals `source_saved_at` and a `today_date`, and a non-forced
 * refresh is skipped when the cached brief already matches the current snapshot.
 * When snapshot tags are missing on either side, a same-UTC-day guard prevents
 * duplicate articles from the late cron safety net. `force` bypasses both checks.
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
      const snapshotComparable = Boolean(sourceSavedAt) && Boolean(existing.source_saved_at);
      const sameSnapshot = snapshotComparable && existing.source_saved_at === sourceSavedAt;
      if (sameSnapshot) {
        return {
          ok: true,
          skipped: true,
          reason: 'already_generated_for_snapshot',
          source_saved_at: sourceSavedAt,
          today_date: todayDate,
          generator: existing.generator,
          brief: existing.brief,
        };
      }
      // Day-level guard only when snapshot tags are missing on either side.
      if (!snapshotComparable) {
        const sameDay = Boolean(existing.today_date) && existing.today_date === todayDate;
        if (sameDay) {
          return {
            ok: true,
            skipped: true,
            reason: 'already_generated_today',
            source_saved_at: sourceSavedAt,
            today_date: todayDate,
            generator: existing.generator,
            brief: existing.brief,
          };
        }
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

export function getDailyTapeRefreshCronSecrets() {
  return [
    process.env.CRON_SECRET,
    process.env.DAILY_TAPE_BUILD_SECRET,
    process.env.WEEKLY_BRIEF_BUILD_SECRET,
  ].filter((secret) => secret != null && String(secret).trim() !== '');
}

export function getDailyTapeRefreshApiBaseUrl(req) {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  const proto = req?.headers?.['x-forwarded-proto'] || 'https';
  if (host) return `${proto}://${host}`;
  return null;
}

/**
 * Fire-and-forget call to /api/refresh-daily-tape after destination news
 * completes for the day's arrivals snapshot. Idempotent: skips if already
 * generated for the current snapshot.
 */
export function scheduleDailyTapeRefresh(req) {
  const secrets = getDailyTapeRefreshCronSecrets();
  if (!secrets.length) {
    console.warn('[refresh-daily-tape] post-news trigger skipped: no auth secret');
    return;
  }

  const baseUrl = getDailyTapeRefreshApiBaseUrl(req);
  if (!baseUrl) {
    console.warn('[refresh-daily-tape] post-news trigger skipped: unknown base URL');
    return;
  }

  const url = `${baseUrl}/api/refresh-daily-tape`;
  fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${String(secrets[0]).trim()}`,
    },
  }).catch((err) => {
    console.warn('[refresh-daily-tape] post-news trigger fetch failed:', err);
  });
}

/**
 * Schedules Daily Tape generation when a news refresh run has fully completed.
 */
export function maybeScheduleDailyTapeAfterNews(req, result) {
  if (!result?.completed) return;
  scheduleDailyTapeRefresh(req);
}
