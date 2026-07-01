import {
  getTiaOpenAiModel,
  normalizeTiaDestinationInput,
  parseTiaJsonRequestBody,
} from './tia-preview.lib.js';
import {
  buildTiaJsonSchemaFormat,
  buildTiaWebSearchTools,
  getTiaResearchModel,
  normalizeTiaRecommendations,
  runTiaTwoPassGeneration,
  shouldUseTiaWebSearchForChat,
  TIA_CHAT_JSON_SCHEMA,
} from './tia-research.lib.js';

const MAX_MESSAGE_LEN = 800;
const MAX_HISTORY_TURNS = 8;
const MAX_BULLETS = 5;
const MAX_FOLLOW_UPS = 4;

function trimString(value, maxLen = 600) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

function sanitizeStringArray(values, maxItems = MAX_BULLETS) {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => trimString(v, 220))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeChatHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const history = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = trimString(item.role, 20).toLowerCase();
    const content = trimString(item.content, MAX_MESSAGE_LEN);
    if ((role !== 'user' && role !== 'assistant') || !content) continue;
    history.push({ role, content });
    if (history.length >= MAX_HISTORY_TURNS) break;
  }
  return history;
}

export function parseTiaChatRequest(rawBody) {
  const parsedBody = parseTiaJsonRequestBody(rawBody);
  if (!parsedBody.ok) return parsedBody;

  const message = trimString(parsedBody.body.message, MAX_MESSAGE_LEN);
  if (!message) {
    return { ok: false, status: 400, error: 'message is required' };
  }

  const destination = normalizeTiaDestinationInput(parsedBody.body.destination);
  if (!destination) {
    return { ok: false, status: 400, error: 'destination.name is required' };
  }
  if (destination.error) {
    return { ok: false, status: 400, error: destination.error };
  }

  return {
    ok: true,
    data: {
      destination,
      message,
      history: normalizeChatHistory(parsedBody.body.history),
    },
  };
}

export function validateTiaChatAnswer(answer, destination) {
  if (!answer || typeof answer !== 'object') return { ok: false, error: 'answer_missing' };

  const title = trimString(answer.title, 160);
  const summary = trimString(answer.summary, 900);
  const bullets = sanitizeStringArray(answer.bullets, MAX_BULLETS);
  const followUps = sanitizeStringArray(answer.followUps, MAX_FOLLOW_UPS);

  if (!title || !summary || bullets.length < 2) {
    return { ok: false, error: 'required_fields_missing' };
  }

  const recommendations = normalizeTiaRecommendations(answer.recommendations);

  return {
    ok: true,
    answer: {
      title,
      summary,
      bullets,
      recommendations,
      followUps: followUps.length ? followUps : [
        'Create a 3-day itinerary',
        'What should I avoid?',
        'Best area to stay?',
      ],
      destinationName: destination.name,
    },
  };
}

const TIA_CHAT_RESEARCH_SYSTEM_PROMPT = `You are Tia, GoTango's Pro travel intelligence research assistant.

Use web search to gather current, destination-specific travel intelligence for the user's question.
Return concise plain-text research notes only. Do not return JSON.
Include source URLs inline when citing specific hotels, restaurants, neighborhoods, events, or activities.
Use GoTango destination context to prioritize timing and seasonality.
Do not invent sources or claim live availability unless sourced.`;

const TIA_CHAT_STRUCTURE_SYSTEM_PROMPT = `You are Tia, GoTango's Pro travel intelligence agent.

Answer as a concise, premium travel advisor using GoTango destination context and research notes.
Use GoTango Score, category, arrivals, signal read, weekly movement, and destination news when available.
Give actual recommendations when research notes support them. Include sourceUrl only when a relevant URL appears in the research notes.
Do not invent URLs. Leave sourceUrl empty when no relevant source is available.
Do not claim availability, pricing, reservations, or current openings unless sourced.
Keep answers mobile-friendly. Use bullets where useful.
Return JSON matching the provided schema exactly.`;

function isStayQuestion(message) {
  return /\b(stay|hotel|lodging|where should i stay|base|neighborhood|area)\b/i.test(message);
}

function isRestaurantQuestion(message) {
  return /\b(restaurant|restaurants|dining|eat|food|reservation)\b/i.test(message);
}

function buildChatResearchUserPrompt(destination, message, history) {
  const historyBlock = history.length
    ? `\n\nRecent conversation:\n${JSON.stringify(history, null, 2)}`
    : '';

  return `Research ${destination.name} (${destination.airportCode}) to help answer this traveler question:

"${message}"${historyBlock}

GoTango destination context:
${JSON.stringify(destination, null, 2)}

Return plain-text research notes with source URLs inline when citing specific hotels, restaurants, neighborhoods, events, or activities.
Do not return JSON.`;
}

function buildChatStructureUserPrompt(destination, message, history, researchNotes) {
  const historyBlock = history.length
    ? `\n\nRecent conversation:\n${JSON.stringify(history, null, 2)}`
    : '';

  const researchBlock = researchNotes
    ? `\n\nResearch notes (use when supported; do not invent URLs):\n${researchNotes}`
    : '\n\nNo web research notes available. Use GoTango context only.';

  let questionGuidance = '';
  if (isStayQuestion(message)) {
    questionGuidance = `
For this lodging question:
- Return specific areas/zones and who each fits.
- Include 2-4 researched lodging candidates only if supported by research notes.
- Mention seasonality or booking pressure when appropriate.`;
  } else if (isRestaurantQuestion(message)) {
    questionGuidance = `
For this dining question:
- Return 3-5 actual restaurant candidates only if supported by research notes.
- Explain why each fits.
- Avoid claiming live reservation status unless sourced.`;
  }

  return `Destination context:
${JSON.stringify(destination, null, 2)}

User question:
${message}${historyBlock}${researchBlock}${questionGuidance}

Return a concise, useful answer with recommendations[] when research notes support specific hotels, restaurants, areas, or activities.`;
}

function buildChatResearchRequest(destination, message, history) {
  return {
    model: getTiaResearchModel(getTiaOpenAiModel()),
    store: false,
    reasoning: { effort: 'medium' },
    text: { verbosity: 'medium' },
    max_output_tokens: 1200,
    tools: buildTiaWebSearchTools(),
    tool_choice: 'auto',
    max_tool_calls: 4,
    include: ['web_search_call.action.sources'],
    input: [
      { role: 'system', content: TIA_CHAT_RESEARCH_SYSTEM_PROMPT },
      { role: 'user', content: buildChatResearchUserPrompt(destination, message, history) },
    ],
  };
}

function buildChatStructureRequest(destination, message, history, researchNotes) {
  return {
    model: getTiaOpenAiModel(),
    store: false,
    reasoning: { effort: 'low' },
    text: {
      verbosity: 'low',
      ...buildTiaJsonSchemaFormat('tia_chat_answer', TIA_CHAT_JSON_SCHEMA),
    },
    max_output_tokens: 900,
    input: [
      { role: 'system', content: TIA_CHAT_STRUCTURE_SYSTEM_PROMPT },
      { role: 'user', content: buildChatStructureUserPrompt(destination, message, history, researchNotes) },
    ],
  };
}

export async function generateTiaChatWithOpenAi({ destination, message, history, apiKey }) {
  const useWebSearch = shouldUseTiaWebSearchForChat(message);

  return runTiaTwoPassGeneration({
    apiKey,
    useWebSearch,
    logPrefix: 'tia-chat',
    buildResearchRequest: () => buildChatResearchRequest(destination, message, history),
    buildStructureRequest: (researchNotes) => buildChatStructureRequest(
      destination,
      message,
      history,
      researchNotes,
    ),
    validateStructured: (parsed) => validateTiaChatAnswer(parsed, destination),
  });
}
