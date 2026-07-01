import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTiaWebSearchEnabled,
  isTiaDebugResearchEnabled,
  normalizeTiaRecommendations,
  shouldUseTiaWebSearchForChat,
  shouldUseTiaWebSearchForPreview,
  extractTiaResponsesOutputText,
  extractTiaJsonFromModelText,
  callTiaResponsesApi,
  runTiaTwoPassGeneration,
} from '../tia-research.lib.js';

test('isTiaWebSearchEnabled respects env flag', () => {
  const original = process.env.TIA_WEB_SEARCH_ENABLED;
  process.env.TIA_WEB_SEARCH_ENABLED = 'true';
  assert.equal(isTiaWebSearchEnabled(), true);
  process.env.TIA_WEB_SEARCH_ENABLED = 'false';
  assert.equal(isTiaWebSearchEnabled(), false);
  if (original == null) delete process.env.TIA_WEB_SEARCH_ENABLED;
  else process.env.TIA_WEB_SEARCH_ENABLED = original;
});

test('isTiaDebugResearchEnabled defaults false', () => {
  const original = process.env.TIA_DEBUG_RESEARCH;
  delete process.env.TIA_DEBUG_RESEARCH;
  assert.equal(isTiaDebugResearchEnabled(), false);
  process.env.TIA_DEBUG_RESEARCH = 'true';
  assert.equal(isTiaDebugResearchEnabled(), true);
  if (original == null) delete process.env.TIA_DEBUG_RESEARCH;
  else process.env.TIA_DEBUG_RESEARCH = original;
});

test('shouldUseTiaWebSearchForPreview enables itinerary and trip when flag on', () => {
  const original = process.env.TIA_WEB_SEARCH_ENABLED;
  process.env.TIA_WEB_SEARCH_ENABLED = 'true';
  assert.equal(shouldUseTiaWebSearchForPreview('itinerary'), true);
  assert.equal(shouldUseTiaWebSearchForPreview('trip'), true);
  process.env.TIA_WEB_SEARCH_ENABLED = 'false';
  assert.equal(shouldUseTiaWebSearchForPreview('itinerary'), false);
  if (original == null) delete process.env.TIA_WEB_SEARCH_ENABLED;
  else process.env.TIA_WEB_SEARCH_ENABLED = original;
});

test('shouldUseTiaWebSearchForChat detects research-heavy questions', () => {
  const original = process.env.TIA_WEB_SEARCH_ENABLED;
  process.env.TIA_WEB_SEARCH_ENABLED = 'true';
  assert.equal(shouldUseTiaWebSearchForChat('Where should I stay?'), true);
  assert.equal(shouldUseTiaWebSearchForChat('Best restaurants right now?'), true);
  assert.equal(shouldUseTiaWebSearchForChat('Hello'), false);
  if (original == null) delete process.env.TIA_WEB_SEARCH_ENABLED;
  else process.env.TIA_WEB_SEARCH_ENABLED = original;
});

test('normalizeTiaRecommendations keeps optional structured cards', () => {
  const items = normalizeTiaRecommendations([
    { type: 'hotel', name: 'White Elephant', why: 'Walkable harbor base.', sourceUrl: 'https://example.com/hotel' },
    { type: 'invalid', name: '', why: 'skip' },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'hotel');
  assert.equal(items[0].sourceUrl, 'https://example.com/hotel');
});

test('extractTiaResponsesOutputText reads response.output_text', () => {
  const text = extractTiaResponsesOutputText({
    output_text: 'Plain research notes with a source (https://example.com/hotel).',
  });
  assert.match(text, /research notes/i);
});

test('extractTiaResponsesOutputText walks message output_text content', () => {
  const text = extractTiaResponsesOutputText({
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: '{"title":"Hello"}' }],
    }],
  });
  assert.equal(text, '{"title":"Hello"}');
});

test('extractTiaResponsesOutputText reads content type text', () => {
  const text = extractTiaResponsesOutputText({
    output: [{
      type: 'message',
      content: [{ type: 'text', text: 'Research note line.' }],
    }],
  });
  assert.equal(text, 'Research note line.');
});

test('extractTiaResponsesOutputText returns empty for missing output', () => {
  assert.equal(extractTiaResponsesOutputText(null), '');
  assert.equal(extractTiaResponsesOutputText({ output: [] }), '');
});

test('extractTiaJsonFromModelText parses raw JSON', () => {
  const parsed = extractTiaJsonFromModelText('{"title":"Stay smart","summary":"Use downtown."}');
  assert.equal(parsed.title, 'Stay smart');
});

test('extractTiaJsonFromModelText parses fenced JSON', () => {
  const parsed = extractTiaJsonFromModelText('```json\n{"title":"Dining"}\n```');
  assert.equal(parsed.title, 'Dining');
});

test('extractTiaJsonFromModelText parses leading prose plus JSON', () => {
  const parsed = extractTiaJsonFromModelText('Here is the answer:\n{"title":"Areas","summary":"Town first."}');
  assert.equal(parsed.title, 'Areas');
});

test('extractTiaJsonFromModelText extracts first balanced JSON object', () => {
  const parsed = extractTiaJsonFromModelText('Notes first {"title":"Balanced","summary":"Works"} trailing');
  assert.equal(parsed.title, 'Balanced');
});

test('callTiaResponsesApi returns text for research pass', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({
      output_text: 'Harbor area fits couples. (source: https://example.com/stay)',
    }),
  });

  try {
    const result = await callTiaResponsesApi('test-key', { model: 'gpt-5.4-mini' }, {
      expectJson: false,
      logPrefix: 'tia-test',
      phase: 'research',
    });
    assert.equal(result.ok, true);
    assert.match(result.text, /Harbor area/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('callTiaResponsesApi parses JSON for structure pass', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '{"title":"Stay","summary":"Town","bullets":["A","B"],"followUps":[],"recommendations":[]}' }],
      }],
    }),
  });

  try {
    const result = await callTiaResponsesApi('test-key', { model: 'gpt-5.4-mini' }, {
      expectJson: true,
      logPrefix: 'tia-test',
      phase: 'structure',
    });
    assert.equal(result.ok, true);
    assert.equal(result.parsed.title, 'Stay');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runTiaTwoPassGeneration uses research notes then validates structure', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          output_text: 'Downtown fits walkable stays. (source: https://example.com/area)',
        }),
      };
    }
    return {
      ok: true,
      text: async () => JSON.stringify({
        output_text: '{"title":"Where to stay","summary":"Downtown works.","bullets":["Walkable","Central"],"followUps":["Create itinerary"],"recommendations":[{"type":"hotel_area","name":"Downtown","why":"Walkable base.","sourceUrl":"https://example.com/area"}]}',
      }),
    };
  };

  try {
    const result = await runTiaTwoPassGeneration({
      apiKey: 'test-key',
      useWebSearch: true,
      logPrefix: 'tia-test',
      buildResearchRequest: () => ({ model: 'gpt-5.4-mini', input: [] }),
      buildStructureRequest: (notes) => {
        assert.match(notes, /Downtown fits/i);
        return { model: 'gpt-5.4-mini', input: [] };
      },
      validateStructured: (parsed) => ({
        ok: true,
        answer: parsed,
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.researchUsed, true);
    assert.equal(result.answer.title, 'Where to stay');
    assert.equal(callCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runTiaTwoPassGeneration skips research when web search disabled', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      text: async () => JSON.stringify({
        output_text: '{"title":"Quick","summary":"Fallback path.","bullets":["One","Two"],"followUps":[],"recommendations":[]}',
      }),
    };
  };

  try {
    const result = await runTiaTwoPassGeneration({
      apiKey: 'test-key',
      useWebSearch: false,
      logPrefix: 'tia-test',
      buildResearchRequest: () => {
        throw new Error('research pass should not run');
      },
      buildStructureRequest: (notes) => {
        assert.equal(notes, '');
        return { model: 'gpt-5.4-mini', input: [] };
      },
      validateStructured: (parsed) => ({ ok: true, answer: parsed }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.researchUsed, false);
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runTiaTwoPassGeneration fails safely when structure validation fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({
      output_text: '{"title":""}',
    }),
  });

  try {
    const result = await runTiaTwoPassGeneration({
      apiKey: 'test-key',
      useWebSearch: false,
      logPrefix: 'tia-test',
      buildResearchRequest: () => ({ model: 'gpt-5.4-mini', input: [] }),
      buildStructureRequest: () => ({ model: 'gpt-5.4-mini', input: [] }),
      validateStructured: () => ({ ok: false, error: 'required_fields_missing' }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, 'required_fields_missing');
    assert.equal(result.status, 502);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runTiaTwoPassGeneration fails safely when research pass is empty', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ output_text: '   ' }),
  });

  try {
    const result = await runTiaTwoPassGeneration({
      apiKey: 'test-key',
      useWebSearch: true,
      logPrefix: 'tia-test',
      buildResearchRequest: () => ({ model: 'gpt-5.4-mini', input: [] }),
      buildStructureRequest: () => ({ model: 'gpt-5.4-mini', input: [] }),
      validateStructured: () => ({ ok: true, answer: {} }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, 'empty_model_output');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
