const RESEARCH_KEYWORDS = [
  'hotel', 'hotels', 'stay', 'staying', 'restaurant', 'restaurants', 'dining', 'eat',
  'food', 'activity', 'activities', 'things to do', 'neighborhood', 'area', 'where should',
  'best place', 'recommend', 'reservation', 'book', 'event', 'events', 'nightlife', 'beach club',
  'resort', 'lodging', 'itinerary', 'timing', 'avoid', 'first day',
];

const RECOMMENDATION_TYPES = new Set([
  'hotel_area', 'hotel', 'restaurant', 'activity', 'event', 'logistics',
]);

const TIA_RESEARCH_TIMEOUT_MS = 22_000;
const TIA_STRUCTURE_TIMEOUT_MS = 22_000;
const DEBUG_TEXT_PREVIEW_LEN = 400;

const TIA_RECOMMENDATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'name', 'why', 'sourceUrl'],
  properties: {
    type: {
      type: 'string',
      enum: ['hotel_area', 'hotel', 'restaurant', 'activity', 'event', 'logistics'],
    },
    name: { type: 'string' },
    why: { type: 'string' },
    sourceUrl: { type: 'string' },
  },
};

const TIA_DAY_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['time', 'title', 'note', 'sourceUrl'],
  properties: {
    time: { type: 'string' },
    title: { type: 'string' },
    note: { type: 'string' },
    sourceUrl: { type: 'string' },
  },
};

function trimString(value, maxLen = 600) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

export function isTiaWebSearchEnabled() {
  const flag = process.env.TIA_WEB_SEARCH_ENABLED?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
}

export function isTiaDebugResearchEnabled() {
  const flag = process.env.TIA_DEBUG_RESEARCH?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
}

export function getTiaResearchModel(defaultModel) {
  const configured = process.env.TIA_RESEARCH_MODEL?.trim();
  return configured || defaultModel;
}

export function shouldUseTiaWebSearchForChat(message) {
  if (!isTiaWebSearchEnabled()) return false;
  const text = String(message || '').trim().toLowerCase();
  if (!text) return false;
  return RESEARCH_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function shouldUseTiaWebSearchForPreview(mode) {
  if (!isTiaWebSearchEnabled()) return false;
  return mode === 'itinerary' || mode === 'trip';
}

export function buildTiaWebSearchTools() {
  return [
    {
      type: 'web_search',
      search_context_size: 'medium',
      filters: {
        blocked_domains: [
          'wikipedia.org',
          'reddit.com',
          'quora.com',
          'facebook.com',
          'pinterest.com',
        ],
      },
    },
  ];
}

export function buildTiaJsonSchemaFormat(name, schema) {
  return {
    format: {
      type: 'json_schema',
      name,
      strict: true,
      schema,
    },
  };
}

export const TIA_ITINERARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'type', 'status', 'title', 'destinationName', 'airportCode',
    'summary', 'bestFor', 'pace', 'days', 'recommendations',
  ],
  properties: {
    type: { type: 'string', enum: ['itinerary'] },
    status: { type: 'string', enum: ['preview'] },
    title: { type: 'string' },
    destinationName: { type: 'string' },
    airportCode: { type: 'string' },
    summary: { type: 'string' },
    bestFor: { type: 'string' },
    pace: { type: 'string' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['day', 'title', 'summary', 'items'],
        properties: {
          day: { type: 'number' },
          title: { type: 'string' },
          summary: { type: 'string' },
          items: {
            type: 'array',
            items: TIA_DAY_ITEM_SCHEMA,
          },
        },
      },
    },
    recommendations: {
      type: 'array',
      items: TIA_RECOMMENDATION_SCHEMA,
    },
  },
};

export const TIA_TRIP_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'type', 'status', 'title', 'destinationName', 'airportCode',
    'overview', 'recommendedBase', 'vibe', 'dontMiss', 'suggestedPlan', 'recommendations',
  ],
  properties: {
    type: { type: 'string', enum: ['trip'] },
    status: { type: 'string', enum: ['preview'] },
    title: { type: 'string' },
    destinationName: { type: 'string' },
    airportCode: { type: 'string' },
    overview: { type: 'string' },
    recommendedBase: { type: 'string' },
    vibe: { type: 'string' },
    dontMiss: {
      type: 'array',
      items: { type: 'string' },
    },
    suggestedPlan: { type: 'string' },
    recommendations: {
      type: 'array',
      items: TIA_RECOMMENDATION_SCHEMA,
    },
  },
};

export const TIA_CHAT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'bullets', 'followUps', 'recommendations'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    bullets: {
      type: 'array',
      items: { type: 'string' },
    },
    followUps: {
      type: 'array',
      items: { type: 'string' },
    },
    recommendations: {
      type: 'array',
      items: TIA_RECOMMENDATION_SCHEMA,
    },
  },
};

function collectTextFromContentPart(part, parts) {
  if (!part || typeof part !== 'object') return;
  const type = part.type;
  if ((type === 'output_text' || type === 'text') && typeof part.text === 'string') {
    parts.push(part.text);
    return;
  }
  if (typeof part.text === 'string' && !type) {
    parts.push(part.text);
  }
}

export function extractTiaResponsesOutputText(response) {
  if (!response || typeof response !== 'object') return '';

  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts = [];
  const output = Array.isArray(response.output) ? response.output : [];

  for (const item of output) {
    if (!item || typeof item !== 'object') continue;

    if (typeof item.text === 'string') {
      parts.push(item.text);
      continue;
    }

    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const part of item.content) {
        collectTextFromContentPart(part, parts);
      }
      continue;
    }

    if (Array.isArray(item.content)) {
      for (const part of item.content) {
        collectTextFromContentPart(part, parts);
      }
    }
  }

  return parts.join('').trim();
}

function extractFirstBalancedJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

export function extractTiaJsonFromModelText(text) {
  if (!text || typeof text !== 'string') return null;

  let raw = text.trim();
  if (!raw) return null;

  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/m, '').trim();
  }

  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  const balanced = extractFirstBalancedJsonObject(raw);
  if (balanced) return balanced;

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

export function logTiaResponsesOutputSummary(response, logPrefix = 'tia-research') {
  if (!response || typeof response !== 'object') {
    console.warn(`[${logPrefix}] OpenAI response missing output`);
    return;
  }

  const types = [];
  if (typeof response.output_text === 'string') types.push('output_text');
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (!item || typeof item !== 'object') continue;
      types.push(item.type || 'unknown');
      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part?.type) types.push(`content:${part.type}`);
        }
      }
    }
  }

  console.warn(`[${logPrefix}] OpenAI output item types:`, types.join(', ') || 'none');
}

function debugLogExtractedText(text, logPrefix, phase) {
  if (!isTiaDebugResearchEnabled()) return;
  const preview = trimString(text, DEBUG_TEXT_PREVIEW_LEN);
  console.warn(`[${logPrefix}] ${phase} text preview:`, preview);
}

export async function callTiaResponsesApi(apiKey, requestBody, options = {}) {
  const {
    timeoutMs = TIA_STRUCTURE_TIMEOUT_MS,
    expectJson = false,
    logPrefix = 'tia-research',
    phase = 'response',
  } = options;

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
      console.warn(`[${logPrefix}] OpenAI HTTP error (${phase}):`, response.status);
      logTiaResponsesOutputSummary(payload, logPrefix);
      return { ok: false, error: 'openai_http_error', status: 502 };
    }

    const outputText = extractTiaResponsesOutputText(payload);
    debugLogExtractedText(outputText, logPrefix, phase);

    if (!outputText) {
      console.warn(`[${logPrefix}] OpenAI returned empty text (${phase})`);
      logTiaResponsesOutputSummary(payload, logPrefix);
      return { ok: false, error: 'empty_model_output', status: 502 };
    }

    if (!expectJson) {
      return { ok: true, text: outputText };
    }

    const parsed = extractTiaJsonFromModelText(outputText);
    if (!parsed) {
      console.warn(`[${logPrefix}] OpenAI returned invalid JSON (${phase})`);
      logTiaResponsesOutputSummary(payload, logPrefix);
      return { ok: false, error: 'invalid_model_json', status: 502 };
    }

    return { ok: true, text: outputText, parsed };
  } catch (err) {
    if (err?.name === 'AbortError') {
      console.warn(`[${logPrefix}] OpenAI request timed out (${phase})`);
      return { ok: false, error: 'openai_timeout', status: 504 };
    }
    console.warn(`[${logPrefix}] OpenAI request failed (${phase})`);
    return { ok: false, error: 'openai_error', status: 502 };
  } finally {
    clearTimeout(timer);
  }
}

export async function runTiaTwoPassGeneration({
  apiKey,
  useWebSearch,
  buildResearchRequest,
  buildStructureRequest,
  validateStructured,
  logPrefix = 'tia-research',
}) {
  let researchNotes = '';
  let researchUsed = false;

  if (useWebSearch) {
    const researchResult = await callTiaResponsesApi(apiKey, buildResearchRequest(), {
      timeoutMs: TIA_RESEARCH_TIMEOUT_MS,
      expectJson: false,
      logPrefix,
      phase: 'research',
    });

    if (!researchResult.ok || !trimString(researchResult.text, 12_000)) {
      console.warn(`[${logPrefix}] research pass failed`);
      return researchResult;
    }

    researchNotes = trimString(researchResult.text, 12_000);
    researchUsed = true;
  }

  const structureResult = await callTiaResponsesApi(apiKey, buildStructureRequest(researchNotes), {
    timeoutMs: TIA_STRUCTURE_TIMEOUT_MS,
    expectJson: true,
    logPrefix,
    phase: 'structure',
  });

  if (!structureResult.ok || !structureResult.parsed) {
    console.warn(`[${logPrefix}] structure pass failed`);
    return structureResult;
  }

  const validated = validateStructured(structureResult.parsed);
  if (!validated.ok) {
    console.warn(`[${logPrefix}] structure validation failed:`, validated.error);
    return { ok: false, error: validated.error, status: 502 };
  }

  return {
    ok: true,
    ...validated,
    researchUsed,
  };
}

export function normalizeTiaRecommendations(raw, maxItems = 8) {
  if (!Array.isArray(raw)) return [];
  const items = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const typeRaw = trimString(entry.type, 40).toLowerCase();
    const type = RECOMMENDATION_TYPES.has(typeRaw) ? typeRaw : 'activity';
    const name = trimString(entry.name, 160);
    const why = trimString(entry.why, 320);
    const sourceUrl = trimString(entry.sourceUrl, 500);
    if (!name || !why) continue;
    items.push({ type, name, why, sourceUrl: sourceUrl || undefined });
    if (items.length >= maxItems) break;
  }
  return items;
}

export function extractSourceDomain(url) {
  const value = trimString(url, 500);
  if (!value) return '';
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, '');
    return trimString(hostname, 120);
  } catch (_) {
    return trimString(value, 120);
  }
}
