import { DESTINATIONS } from './destinations.config.js';
import { extractResponsesOutputText, parseBriefJsonFromModelText } from './weekly-brief.lib.js';
import {
  buildTiaWebSearchTools,
  getTiaResearchModel,
  normalizeTiaRecommendations,
  shouldUseTiaWebSearchForPreview,
} from './tia-research.lib.js';

const MAX_BODY_BYTES = 24_000;
const OPENAI_TIMEOUT_MS = 25_000;
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

const TIA_SYSTEM_PROMPT = `You are Tia, GoTango's Pro travel intelligence agent.

Write premium, useful, concise travel plans for GoTango core destinations.
Use GoTango destination context first: GoTango Score, category, arrivals, signal read, weekly movement, and destination news.
When web research is available, use it for current hotels, restaurant areas, activities, neighborhoods, events, and timing notes.
Give actual recommendations when you have source support. Include sourceUrl on researched facts.
Sound native to GoTango: smart, stylish, destination-led, and mobile-friendly.

Rules:
- Return strict JSON only. No markdown. No HTML.
- status must be "preview".
- Distinguish hotel areas, example hotels, restaurants, activities, events, and logistics.
- Explain why each recommendation fits the traveler and destination signal.
- Do not claim availability, pricing, reservations, or current openings unless sourced.
- Avoid generic filler like "local dining" without useful detail.
- Keep copy concise enough for mobile cards.
- Make the preview valuable enough that saving with GoTango Pro feels worthwhile.`;

function buildItineraryUserPrompt(destination, options) {
  return `Create a preview itinerary JSON for mode "itinerary".

Destination context:
${JSON.stringify(destination, null, 2)}

User options:
${JSON.stringify(options, null, 2)}

Return JSON with this shape:
{
  "type": "itinerary",
  "status": "preview",
  "title": string,
  "destinationName": string,
  "airportCode": string,
  "summary": string,
  "bestFor": string,
  "pace": string,
  "days": [
    {
      "day": number,
      "title": string,
      "summary": string,
      "items": [
        { "time": string, "title": string, "note": string, "sourceUrl": string }
      ]
    }
  ],
  "recommendations": [
    {
      "type": "hotel_area" | "hotel" | "restaurant" | "activity" | "event" | "logistics",
      "name": string,
      "why": string,
      "sourceUrl": string
    }
  ]
}

Match the number of days to trip length when possible. items are optional but encouraged (1-3 per day).
Use web research for specific neighborhoods, activities, and dining when enabled.`;
}

function buildTripUserPrompt(destination, options) {
  return `Create a preview trip brief JSON for mode "trip".

Destination context:
${JSON.stringify(destination, null, 2)}

User options:
${JSON.stringify(options, null, 2)}

Return JSON with this shape:
{
  "type": "trip",
  "status": "preview",
  "title": string,
  "destinationName": string,
  "airportCode": string,
  "overview": string,
  "recommendedBase": string,
  "vibe": string,
  "dontMiss": [string, string, string],
  "suggestedPlan": string,
  "recommendations": [
    {
      "type": "hotel_area" | "hotel" | "restaurant" | "activity" | "event" | "logistics",
      "name": string,
      "why": string,
      "sourceUrl": string
    }
  ]
}`;
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

export function buildTiaOpenAiRequest(mode, destination, options, requestOptions = {}) {
  const useWebSearch = !!requestOptions.useWebSearch;
  const model = useWebSearch
    ? getTiaResearchModel(getTiaOpenAiModel())
    : getTiaOpenAiModel();
  const userPrompt = mode === 'trip'
    ? buildTripUserPrompt(destination, options)
    : buildItineraryUserPrompt(destination, options);

  const body = {
    model,
    store: false,
    reasoning: { effort: useWebSearch ? 'medium' : 'low' },
    text: { verbosity: 'low' },
    max_output_tokens: mode === 'trip' ? 1400 : 1800,
    input: [
      { role: 'system', content: TIA_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  };

  if (useWebSearch) {
    body.tools = buildTiaWebSearchTools();
    body.tool_choice = 'auto';
    body.max_tool_calls = 4;
    body.include = ['web_search_call.action.sources'];
  }

  return body;
}

export async function callTiaOpenAi(apiKey, requestBody, timeoutMs = OPENAI_TIMEOUT_MS, useWebSearch = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let payload = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      console.warn('[tia-preview] OpenAI HTTP error:', response.status);
      return { ok: false, error: 'openai_http_error', status: 502 };
    }

    const outputText = extractResponsesOutputText(payload);
    const parsed = parseBriefJsonFromModelText(outputText);
    if (!parsed) {
      console.warn('[tia-preview] OpenAI returned invalid JSON');
      return { ok: false, error: 'invalid_model_json', status: 502 };
    }

    return { ok: true, parsed };
  } catch (err) {
    if (err?.name === 'AbortError') {
      console.warn('[tia-preview] OpenAI request timed out');
      return { ok: false, error: 'openai_timeout', status: 504 };
    }
    console.warn('[tia-preview] OpenAI request failed');
    return { ok: false, error: 'openai_error', status: 502 };
  } finally {
    clearTimeout(timer);
  }
}

export async function generateTiaPreviewWithOpenAi({ mode, destination, options, apiKey }) {
  const useWebSearch = shouldUseTiaWebSearchForPreview(mode);
  const requestBody = buildTiaOpenAiRequest(mode, destination, options, { useWebSearch });
  const ai = await callTiaOpenAi(apiKey, requestBody, OPENAI_TIMEOUT_MS, useWebSearch);
  if (!ai.ok) return ai;

  const validated = validateTiaPreviewModelJson(mode, ai.parsed, destination, options);
  if (!validated.ok) {
    console.warn('[tia-preview] model JSON failed validation:', validated.error);
    return { ok: false, error: validated.error, status: 502 };
  }

  return {
    ok: true,
    preview: validated.preview,
    researchUsed: useWebSearch,
  };
}
