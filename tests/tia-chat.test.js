import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTiaChatRequest,
  validateTiaChatAnswer,
} from '../tia-chat.lib.js';
import { getTiaOpenAiModel } from '../tia-preview.lib.js';

const baseDestination = {
  id: 'nantucket',
  name: 'Nantucket',
  airportCode: 'KACK',
  goTangoScore: 92,
  category: 'In Season',
};

test('getTiaOpenAiModel defaults to gpt-5.4-mini', () => {
  const original = process.env.TIA_OPENAI_MODEL;
  delete process.env.TIA_OPENAI_MODEL;
  assert.equal(getTiaOpenAiModel(), 'gpt-5.4-mini');
  process.env.TIA_OPENAI_MODEL = 'custom-model';
  assert.equal(getTiaOpenAiModel(), 'custom-model');
  if (original == null) delete process.env.TIA_OPENAI_MODEL;
  else process.env.TIA_OPENAI_MODEL = original;
});

test('parseTiaChatRequest requires message and core destination', () => {
  const missingMessage = parseTiaChatRequest({
    destination: baseDestination,
    message: '   ',
  });
  assert.equal(missingMessage.ok, false);

  const valid = parseTiaChatRequest({
    destination: baseDestination,
    message: 'What should I know before going?',
    history: [{ role: 'user', content: 'Hello' }],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.data.message, 'What should I know before going?');
});

test('parseTiaChatRequest rejects unsupported destination id', () => {
  const parsed = parseTiaChatRequest({
    destination: { id: 'custom-place', name: 'Custom Place' },
    message: 'Hi',
  });
  assert.equal(parsed.ok, false);
});

test('validateTiaChatAnswer normalizes answer shape', () => {
  const validated = validateTiaChatAnswer({
    title: 'What to know about Nantucket right now',
    summary: 'A concise traveler-friendly answer.',
    bullets: [
      'Keep timing flexible while interest is elevated.',
      'Use day one for an easy arrival rhythm.',
    ],
    followUps: ['Create a 3-day itinerary', 'Best area to stay?'],
    recommendations: [{
      type: 'restaurant',
      name: 'The Company',
      why: 'Strong seasonal seafood.',
      sourceUrl: 'https://example.com/restaurant',
    }],
  }, baseDestination);

  assert.equal(validated.ok, true);
  assert.equal(validated.answer.bullets.length, 2);
  assert.equal(validated.answer.recommendations.length, 1);
});

test('validateTiaChatAnswer rejects incomplete answer', () => {
  const validated = validateTiaChatAnswer({
    title: 'Incomplete',
    summary: '',
    bullets: [],
  }, baseDestination);
  assert.equal(validated.ok, false);
});
