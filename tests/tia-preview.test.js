import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTiaPreviewRequest,
  validateItineraryPreview,
  validateTripPreview,
  validateTiaPreviewModelJson,
} from '../tia-preview.lib.js';

const baseDestination = {
  id: 'nantucket',
  name: 'Nantucket',
  airportCode: 'KACK',
  goTangoScore: 92,
  category: 'In Season',
};

test('parseTiaPreviewRequest rejects non-POST modes and missing destination name', () => {
  const badMode = parseTiaPreviewRequest({ mode: 'save', destination: { name: 'Nantucket' } });
  assert.equal(badMode.ok, false);

  const missingName = parseTiaPreviewRequest({ mode: 'trip', destination: { id: 'nantucket' } });
  assert.equal(missingName.ok, false);
});

test('parseTiaPreviewRequest accepts itinerary request for core destination', () => {
  const parsed = parseTiaPreviewRequest({
    mode: 'itinerary',
    destination: baseDestination,
    options: { tripLength: '3 days' },
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.mode, 'itinerary');
  assert.equal(parsed.data.destination.name, 'Nantucket');
});

test('parseTiaPreviewRequest rejects unsupported destination id', () => {
  const parsed = parseTiaPreviewRequest({
    mode: 'trip',
    destination: { id: 'custom-place', name: 'Custom Place' },
  });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /not supported/i);
});

test('validateItineraryPreview normalizes required fields and days', () => {
  const validated = validateItineraryPreview({
    type: 'itinerary',
    status: 'preview',
    title: '3-Day Nantucket Itinerary',
    destinationName: 'Nantucket',
    airportCode: 'KACK',
    summary: 'A relaxed preview plan.',
    bestFor: 'Long weekend',
    pace: 'Relaxed',
    days: [
      {
        day: 1,
        title: 'Arrival',
        summary: 'Easy first day.',
        items: [{ time: 'Afternoon', title: 'Waterfront walk', note: 'Keep it light.' }],
      },
    ],
  }, baseDestination, { dates: 'Upcoming trip', travelStyle: 'Relaxed', interests: 'Beaches' });

  assert.equal(validated.ok, true);
  assert.equal(validated.preview.days.length, 1);
  assert.equal(validated.preview.days[0].items.length, 1);
});

test('validateTripPreview requires dontMiss list and core fields', () => {
  const validated = validateTripPreview({
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
  }, baseDestination, { tripPurpose: 'Long weekend', travelers: 'Couples', travelStyle: 'Relaxed luxury' });

  assert.equal(validated.ok, true);
  assert.equal(validated.preview.dontMiss.length, 2);
});

test('validateTiaPreviewModelJson rejects incomplete itinerary', () => {
  const validated = validateTiaPreviewModelJson('itinerary', { title: 'Incomplete' }, baseDestination, {});
  assert.equal(validated.ok, false);
});
