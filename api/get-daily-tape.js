import {
  TODAY_MOVEMENT_LLM_SYSTEM_PROMPT,
  generateDailyTapeBrief,
  validateTodayMovementInput,
} from '../daily-tape.lib.js';

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = readJsonBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
  }

  const input = body.input;
  const inputValidation = validateTodayMovementInput(input);
  if (!inputValidation.ok) {
    return res.status(400).json({
      ok: false,
      error: `Invalid input: ${inputValidation.errors.join(', ')}`,
    });
  }

  const systemPrompt = body.systemPrompt && String(body.systemPrompt).trim()
    ? String(body.systemPrompt).trim()
    : TODAY_MOVEMENT_LLM_SYSTEM_PROMPT;

  try {
    const result = await generateDailyTapeBrief({
      input,
      systemPrompt,
      enrichNews: true,
    });

    if (!result.ok) {
      return res.status(200).json({
        ok: false,
        error: result.error,
        llm_error: result.llm_error,
        input: result.input,
      });
    }

    return res.status(200).json({
      ok: true,
      brief: result.brief,
      generator: result.generator,
      llm_error: result.llm_error,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[get-daily-tape] failed:', message);
    return res.status(500).json({ ok: false, error: message });
  }
}
