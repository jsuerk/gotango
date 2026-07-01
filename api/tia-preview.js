import {
  generateTiaPreviewWithOpenAi,
  parseTiaPreviewRequest,
} from '../tia-preview.lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const parsed = parseTiaPreviewRequest(req.body);
    if (!parsed.ok) {
      return res.status(parsed.status || 400).json({ ok: false, error: parsed.error });
    }

    const apiKey = process.env.TIA_OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({ ok: false, error: 'Tia AI unavailable' });
    }

    const result = await generateTiaPreviewWithOpenAi({
      ...parsed.data,
      apiKey,
    });

    if (!result.ok) {
      return res.status(result.status || 502).json({ ok: false, error: 'Preview generation failed' });
    }

    return res.status(200).json({
      ok: true,
      source: 'openai',
      preview: result.preview,
    });
  } catch (err) {
    console.error('[tia-preview] unexpected error');
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
