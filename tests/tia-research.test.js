import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTiaWebSearchEnabled,
  normalizeTiaRecommendations,
  shouldUseTiaWebSearchForChat,
  shouldUseTiaWebSearchForPreview,
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
