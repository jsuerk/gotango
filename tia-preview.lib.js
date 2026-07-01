import { DESTINATIONS } from './destinations.config.js';
import {
  buildTiaJsonSchemaFormat,
  buildTiaWebSearchTools,
  getTiaResearchModel,
  normalizeTiaRecommendations,
  runTiaTwoPassGeneration,
  shouldUseTiaWebSearchForPreview,
  TIA_ITINERARY_JSON_SCHEMA,
  TIA_TRIP_JSON_SCHEMA,
} from './tia-research.lib.js';

const MAX_BODY_BYTES = 24_000;
const DEFAULT_MODEL = 'gpt-5.4-mini';
const MAX_STRING_LEN = 600;
const MAX_DAY_ITEMS = 4;

const CORE_DESTINATION_IDS = new Set(DESTINATIONS.map((d) => d.id));

export function getTiaOpenAiModel() {
  const configured = process.env.TIA_OPENAI_MODEL?.trim();
  return configured || DEFAULT_MODEL;
}

export function parseTiaJsonRequestBody(rawBody) {
  return parseJsonBody(rawBody);
}

export function normalizeTiaDestinationInput(raw) {
  return normalizeDestinationInput(raw);
}

function trimString(value, maxLen = MAX_STRING_LEN) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

function sanitizeStringArray(values, maxItems = 6) {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => trimString(v, 180))
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseJsonBody(rawBody) {
  let body = rawBody;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      return { ok: false, status: 413, error: 'Request body too large' };
    }
    try {
      body = JSON.parse(body);
    } catch {
      return { ok: false, status: 400, error: 'Invalid JSON body' };
    }
  } else if (body && typeof body === 'object') {
    const size = Buffer.byteLength(JSON.stringify(body), 'utf8');
    if (size > MAX_BODY_BYTES) {
      return { ok: false, status: 413, error: 'Request body too large' };
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'Invalid request body' };
  }
  return { ok: true, body };
}

function normalizeDestinationInput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = trimString(raw.id, 80);
  const name = trimString(raw.name, 120);
  if (!name) return null;
  if (!id || !CORE_DESTINATION_IDS.has(id)) {
    return { error: 'Destination is not supported for Tia preview yet.' };
  }
  return {
    id: id || null,
    name,
    airportCode: trimString(raw.airportCode, 24),
    state: trimString(raw.state, 80),
    country: trimString(raw.country, 80),
    goTangoScore: Number.isFinite(Number(raw.goTangoScore)) ? Number(raw.goTangoScore) : null,
    category: trimString(raw.category, 80),
    signalRead: trimString(raw.signalRead, 500),
    arrivals24h: Number.isFinite(Number(raw.arrivals24h)) ? Number(raw.arrivals24h) : null,
    weeklyMovement: trimString(raw.weeklyMovement, 40),
    newsSummary: trimString(raw.newsSummary, 1200),
    sources: Array.isArray(raw.sources)
      ? raw.sources.slice(0, 6).map((s) => ({
        title: trimString(s?.title, 160),
        domain: trimString(s?.domain, 120),
      })).filter((s) => s.title || s.domain)
      : [],
  };
}

function normalizeOptionsInput(raw) {
  const options = raw && typeof raw === 'object' ? raw : {};
  return {
    tripLength: trimString(options.tripLength, 40) || '3 days',
    dates: trimString(options.dates, 80) || 'Upcoming trip',
    travelStyle: trimString(options.travelStyle, 80) || 'Relaxed',
    interests: trimString(options.interests, 160) || 'Beaches, Food, Culture',
    tripPurpose: trimString(options.tripPurpose, 80) || 'Long weekend',
    travelers: trimString(options.travelers, 80) || 'Couples',
  };
}

export function parseTiaPreviewRequest(rawBody) {
  const parsedBody = parseJsonBody(rawBody);
  if (!parsedBody.ok) return parsedBody;

  const mode = trimString(parsedBody.body.mode, 20).toLowerCase();
  if (mode !== 'itinerary' && mode !== 'trip') {
    return { ok: false, status: 400, error: 'mode must be itinerary or trip' };
  }

  const destination = normalizeDestinationInput(parsedBody.body.destination);
  if (!destination) {
    return { ok: false, status: 400, error: 'destination.name is required' };
  }
  if (destination.error) {
    return { ok: false, status: 400, error: destination.error };
  }

  return {
    ok: true,
    data: {
      mode,
      destination,
      options: normalizeOptionsInput(parsedBody.body.options),
    },
  };
}

const TIA_RESEARCH_SYSTEM_PROMPT = `You are Tia, GoTango's Pro travel intelligence research assistant.

Use web search to gather current, destination-specific travel intelligence.
Return concise plain-text research notes only. Do not return JSON.
Include source URLs inline when citing specific hotels, restaurants, neighborhoods, events, or activities.
Use GoTango destination context to prioritize timing, crowd pressure, and seasonality.
Do not invent sources or claim live availability unless sourced.`;

const TIA_STRUCTURE_SYSTEM_PROMPT = `You are Tia, GoTango's Pro travel intelligence agent.

Convert GoTango destination context and research notes into a premium, mobile-friendly preview plan.
Use GoTango Score, category, arrivals, signal read, weekly movement, and destination news to explain timing and crowd pressure.
Use research notes for specific neighborhoods, hotels, restaurants, beaches, activities, and events when supported.
Give actual recommendations when research notes support them. Include sourceUrl only when a relevant URL appears in the research notes.
Do not invent URLs. Leave sourceUrl empty when no relevant source is available.
Avoid generic filler. Keep copy concise for mobile cards.
Return JSON matching the provided schema exactly.`;

function buildPreviewResearchUserPrompt(mode, destination, options) {
  const intent = mode === 'trip'
    ? `trip brief for purpose "${options.tripPurpose}", travelers "${options.travelers}", style "${options.travelStyle}"`
    : `${options.tripLength} itinerary, style "${options.travelStyle}", interests "${options.interests}"`;

  return `Research ${destination.name} (${destination.airportCode}) for a ${mode} preview.

User intent: ${intent}
Dates: ${options.dates}

GoTango destination context:
${JSON.stringify(destination, null, 2)}

Return plain-text research notes covering:
- Neighborhoods/areas to stay and who each fits
- 2-4 lodging candidates only if credible sources exist
- Notable restaurants, dining areas, or food experiences
- Activities, beaches, events, or seasonal highlights
- Timing, seasonality, and booking/crowd pressure notes tied to GoTango signal when relevant

Include source URLs inline when citing specific facts. Do not return JSON.`;
}

function buildItineraryStructureUserPrompt(destination, options, researchNotes) {
  const researchBlock = researchNotes
    ? `\n\nResearch notes (use when supported; do not invent URLs):\n${researchNotes}`
    : '\n\nNo web research notes available. Use GoTango context only.';

  return `Create a preview itinerary for ${destination.name} (${destination.airportCode}).

Destination context:
${JSON.stringify(destination, null, 2)}

User options:
${JSON.stringify(options, null, 2)}${researchBlock}

Requirements:
- Match day count to trip length when possible (typically 3 days).
- Use destination-specific areas, activities, restaurants, beaches, and neighborhoods when research notes support them.
- Explain timing/crowd pressure using GoTango Score, category, arrivals, and signal read when relevant.
- Include 1-3 timed items per day when useful.
- Add recommendations[] for standout hotel areas, hotels, restaurants, or activities when research notes support them.
- Keep copy concise and mobile-card friendly.`;
}

function buildTripStructureUserPrompt(destination, options, researchNotes) {
  const researchBlock = researchNotes
    ? `\n\nResearch notes (use when supported; do not invent URLs):\n${researchNotes}`
    : '\n\nNo web research notes available. Use GoTango context only.';

  return `Create a preview trip brief for ${destination.name} (${destination.airportCode}).

This should feel meaningfully different from a day-by-day itinerary: focus on trip framing, base area, vibe, and priorities.

Destination context:
${JSON.stringify(destination, null, 2)}

User options:
${JSON.stringify(options, null, 2)}${researchBlock}

Requirements:
- recommendedBase should name a specific area/neighborhood when research notes support it.
- dontMiss should be destination-specific, not generic.
- suggestedPlan should read like a trip strategy, not a daily schedule.
- Add recommendations[] for hotel areas, hotels, restaurants, or activities when research notes support them.
- Use GoTango signal context for timing/crowd guidance.`;
}

function buildPreviewResearchRequest(mode, destination, options) {
  return {
    model: getTiaResearchModel(getTiaOpenAiModel()),
    store: false,
    reasoning: { effort: 'medium' },
    text: { verbosity: 'medium' },
    max_output_tokens: 1400,
    tools: buildTiaWebSearchTools(),
    tool_choice: 'auto',
    max_tool_calls: 4,
    include: ['web_search_call.action.sources'],
    input: [
      { role: 'system', content: TIA_RESEARCH_SYSTEM_PROMPT },
      { role: 'user', content: buildPreviewResearchUserPrompt(mode, destination, options) },
    ],
  };
}

function buildPreviewStructureRequest(mode, destination, options, researchNotes) {
  const schema = mode === 'trip' ? TIA_TRIP_JSON_SCHEMA : TIA_ITINERARY_JSON_SCHEMA;
  const schemaName = mode === 'trip' ? 'tia_trip_preview' : 'tia_itinerary_preview';
  const userPrompt = mode === 'trip'
    ? buildTripStructureUserPrompt(destination, options, researchNotes)
    : buildItineraryStructureUserPrompt(destination, options, researchNotes);

  return {
    model: getTiaOpenAiModel(),
    store: false,
    reasoning: { effort: 'low' },
    text: {
      verbosity: 'low',
      ...buildTiaJsonSchemaFormat(schemaName, schema),
    },
    max_output_tokens: mode === 'trip' ? 1400 : 1800,
    input: [
      { role: 'system', content: TIA_STRUCTURE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  };
}

function normalizeDayItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_DAY_ITEMS).map((item) => ({
    time: trimString(item?.time, 40),
    title: trimString(item?.title, 120),
    note: trimString(item?.note, 220),
    sourceUrl: trimString(item?.sourceUrl, 500) || undefined,
  })).filter((item) => item.title || item.note);
}

export function validateItineraryPreview(preview, destination, options) {
  if (!preview || typeof preview !== 'object') return { ok: false, error: 'preview_missing' };
  const days = Array.isArray(preview.days) ? preview.days : [];
  if (!days.length) return { ok: false, error: 'days_missing' };

  const title = trimString(preview.title, 160);
  const summary = trimString(preview.summary, 900);
  const bestFor = trimString(preview.bestFor, 160);
  const pace = trimString(preview.pace, 80);
  if (!title || !summary || !bestFor || !pace) {
    return { ok: false, error: 'required_fields_missing' };
  }

  const normalizedDays = days.slice(0, 14).map((day, index) => {
    const dayNum = Number.isFinite(Number(day?.day)) ? Number(day.day) : index + 1;
    const dayTitle = trimString(day?.title, 120);
    const daySummary = trimString(day?.summary, 500);
    if (!dayTitle || !daySummary) return null;
    return {
      day: dayNum,
      title: dayTitle,
      summary: daySummary,
      items: normalizeDayItems(day?.items),
    };
  }).filter(Boolean);

  if (!normalizedDays.length) return { ok: false, error: 'days_invalid' };

  const recommendations = normalizeTiaRecommendations(preview.recommendations);

  return {
    ok: true,
    preview: {
      type: 'itinerary',
      status: 'preview',
      title,
      destinationName: trimString(preview.destinationName, 120) || destination.name,
      airportCode: trimString(preview.airportCode, 24) || destination.airportCode,
      summary,
      bestFor,
      pace,
      days: normalizedDays,
      recommendations,
      dates: trimString(options.dates, 80),
      travelStyle: trimString(options.travelStyle, 80),
      interests: trimString(options.interests, 160),
    },
  };
}

export function validateTripPreview(preview, destination, options) {
  if (!preview || typeof preview !== 'object') return { ok: false, error: 'preview_missing' };

  const title = trimString(preview.title, 160);
  const overview = trimString(preview.overview, 900);
  const recommendedBase = trimString(preview.recommendedBase, 220);
  const vibe = trimString(preview.vibe, 220);
  const suggestedPlan = trimString(preview.suggestedPlan, 700);
  const dontMiss = sanitizeStringArray(preview.dontMiss, 5);

  if (!title || !overview || !recommendedBase || !vibe || !suggestedPlan || dontMiss.length < 2) {
    return { ok: false, error: 'required_fields_missing' };
  }

  const recommendations = normalizeTiaRecommendations(preview.recommendations);

  return {
    ok: true,
    preview: {
      type: 'trip',
      status: 'preview',
      title,
      destinationName: trimString(preview.destinationName, 120) || destination.name,
      airportCode: trimString(preview.airportCode, 24) || destination.airportCode,
      overview,
      recommendedBase,
      vibe,
      dontMiss,
      suggestedPlan,
      recommendations,
      dates: trimString(options.dates, 80),
      tripPurpose: trimString(options.tripPurpose, 80),
      travelers: trimString(options.travelers, 80),
      travelStyle: trimString(options.travelStyle, 80),
    },
  };
}

export function validateTiaPreviewModelJson(mode, preview, destination, options) {
  if (mode === 'trip') return validateTripPreview(preview, destination, options);
  return validateItineraryPreview(preview, destination, options);
}

export async function generateTiaPreviewWithOpenAi({ mode, destination, options, apiKey }) {
  const useWebSearch = shouldUseTiaWebSearchForPreview(mode);

  return runTiaTwoPassGeneration({
    apiKey,
    useWebSearch,
    logPrefix: 'tia-preview',
    buildResearchRequest: () => buildPreviewResearchRequest(mode, destination, options),
    buildStructureRequest: (researchNotes) => buildPreviewStructureRequest(
      mode,
      destination,
      options,
      researchNotes,
    ),
    validateStructured: (parsed) => validateTiaPreviewModelJson(mode, parsed, destination, options),
  });
}
