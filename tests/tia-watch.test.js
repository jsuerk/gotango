import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTiaWatchItineraryItem,
  buildTiaWatchTripItem,
  findDuplicateTiaWatchItem,
  normalizeTiaWatchItems,
  validateTiaWatchItem,
} from '../tia-watch.lib.js';

const itineraryPreview = {
  type: 'itinerary',
  status: 'preview',
  title: '3-Day Nantucket Itinerary',
  destinationName: 'Nantucket',
  airportCode: 'KACK',
  summary: 'A relaxed plan.',
  bestFor: 'Long weekend',
  pace: 'Relaxed',
  days: [{ day: 1, title: 'Arrival', summary: 'Easy first day.' }],
};

const tripPreview = {
  type: 'trip',
  status: 'preview',
  title: 'Nantucket Trip',
  destinationName: 'Nantucket',
  airportCode: 'KACK',
  overview: 'A smart trip brief.',
  recommendedBase: 'Central / walkable area',
  vibe: 'Relaxed luxury',
  dontMiss: ['Local dining', 'Waterfront time'],
  suggestedPlan: 'Settle in, explore, depart flexibly.',
};

test('buildTiaWatchItineraryItem creates saved structured item', () => {
  const item = buildTiaWatchItineraryItem(itineraryPreview, 'nantucket', '2026-01-01T00:00:00.000Z');
  assert.ok(item);
  assert.equal(item.type, 'itinerary');
  assert.equal(item.status, 'saved');
  assert.equal(item.source, 'tia');
  assert.equal(item.destinationId, 'nantucket');
});

test('buildTiaWatchTripItem creates saved structured item', () => {
  const item = buildTiaWatchTripItem(tripPreview, 'nantucket', '2026-01-01T00:00:00.000Z');
  assert.ok(item);
  assert.equal(item.type, 'trip');
  assert.equal(item.dontMiss.length, 2);
});

test('findDuplicateTiaWatchItem matches type destination and title', () => {
  const item = buildTiaWatchItineraryItem(itineraryPreview, 'nantucket', '2026-01-01T00:00:00.000Z');
  const dup = findDuplicateTiaWatchItem([item], {
    type: 'itinerary',
    destinationId: 'nantucket',
    title: '3-Day Nantucket Itinerary',
  });
  assert.equal(dup, item);
});

test('normalizeTiaWatchItems drops invalid entries', () => {
  const item = buildTiaWatchTripItem(tripPreview, 'nantucket');
  const normalized = normalizeTiaWatchItems([item, { type: 'trip', title: 'incomplete' }]);
  assert.equal(normalized.length, 1);
  assert.equal(validateTiaWatchItem(normalized[0]), true);
});
