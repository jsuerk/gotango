import {
  callTiaOpenAi,
  getTiaOpenAiModel,
  normalizeTiaDestinationInput,
  parseTiaJsonRequestBody,
} from './tia-preview.lib.js';

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

  return {
    ok: true,
    answer: {
      title,
      summary,
      bullets,
      followUps: followUps.length ? followUps : [
        'Create a 3-day itinerary',
        'What should I avoid?',
        'Best area to stay?',
      ],
      destinationName: destination.name,
    },
  };
}

const TIA_CHAT_SYSTEM_PROMPT = `You are Tia, GoTango's Pro travel intelligence agent.

Answer as a concise, premium travel advisor using the provided GoTango destination context.
Use GoTango Score, category, arrivals, signal read, weekly movement, and destination news when available.
Be helpful and specific without inventing exact venues, hotels, prices, schedules, or availability unless provided.
Mention GoTango Pro only when naturally relevant (saving, daily updates, itineraries), not as a hard sell.
Keep answers mobile-friendly. Use bullets where useful.
Return strict JSON only. No markdown. No HTML.`;

function buildTiaChatUserPrompt(destination, message, history) {
  const historyBlock = history.length
    ? `\n\nRecent conversation:\n${JSON.stringify(history, null, 2)}`
    : '';

  return `Destination context:
${JSON.stringify(destination, null, 2)}

User question:
${message}${historyBlock}

Return JSON with this shape:
{
  "title": string,
  "summary": string,
  "bullets": [string, string, string],
  "followUps": [string, string, string]
}`;
}

export function buildTiaChatOpenAiRequest(destination, message, history) {
  return {
    model: getTiaOpenAiModel(),
    store: false,
    reasoning: { effort: 'low' },
    text: { verbosity: 'low' },
    max_output_tokens: 900,
    input: [
      { role: 'system', content: TIA_CHAT_SYSTEM_PROMPT },
      { role: 'user', content: buildTiaChatUserPrompt(destination, message, history) },
    ],
  };
}

export async function generateTiaChatWithOpenAi({ destination, message, history, apiKey }) {
  const requestBody = buildTiaChatOpenAiRequest(destination, message, history);
  const ai = await callTiaOpenAi(apiKey, requestBody);
  if (!ai.ok) return ai;

  const validated = validateTiaChatAnswer(ai.parsed, destination);
  if (!validated.ok) {
    console.warn('[tia-chat] model JSON failed validation:', validated.error);
    return { ok: false, error: validated.error, status: 502 };
  }

  return { ok: true, answer: validated.answer };
}
