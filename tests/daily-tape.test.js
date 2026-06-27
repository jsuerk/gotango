import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TODAY_MOVEMENT_LLM_SYSTEM_PROMPT,
  buildDailyTapePrompt,
  buildSignalChipsFromInput,
  normalizeDailyTapeBrief,
  parseDailyTapeJsonFromModelText,
  validateDailyTapeDraft,
  validateTodayMovementInput,
  enrichTodayMovementInputWithNewsFromKv,
} from '../daily-tape.lib.js';

const SAMPLE_INPUT = {
  todayDate: '2026-06-27',
  updatedAt: 'UPDATED 14:00Z',
  destinationCount: 51,
  heatingCount: 10,
  coolingCount: 4,
  steadyCount: 20,
  privateArrivals24h: 1744,
  destinations: [
    {
      id: 'mykonos',
      name: 'Mykonos',
      region: 'Cyclades, Greece',
      status: 'heating',
      goTangoScore: 88,
      aiNewsBlurb: 'New beach club openings are pulling early-season charters.',
      sourceHeadlines: ['Mykonos season opens with new hospitality'],
    },
    {
      id: 'aspen',
      name: 'Aspen',
      region: 'Colorado Rockies',
      status: 'cooling',
      goTangoScore: 55,
    },
  ],
};

test('TODAY_MOVEMENT_LLM_SYSTEM_PROMPT forbids MATTERS and requires HEATING', () => {
  assert.match(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /Daily Tape writer for GoTango/);
  assert.match(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /Do not use “MATTERS” as a verdict label/);
  assert.match(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /Use “HEATING” as the primary positive verdict label/);
});

test('validateTodayMovementInput accepts well-formed input', () => {
  const result = validateTodayMovementInput(SAMPLE_INPUT);
  assert.equal(result.ok, true);
});

test('validateDailyTapeDraft rejects MATTERS verdict', () => {
  const result = validateDailyTapeDraft({
    headline: 'Summer heat builds',
    verdict: 'MATTERS',
    confidence: 'MEDIUM',
    paragraphs: ['One.', 'Two.', 'Three.'],
    signalChips: [{ label: 'HEATING', value: '10', tone: 'heating' }],
    drivers: [
      { label: 'BREADTH', value: 'WIDE', detail: 'Broad move.', tone: 'heating' },
      { label: 'WATCH NEXT', value: 'RANK', detail: 'Hold rank.', tone: 'neutral' },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('invalid_verdict'));
});

test('validateDailyTapeDraft accepts valid draft', () => {
  const result = validateDailyTapeDraft({
    headline: 'Island markets carry the tape',
    verdict: 'HEATING',
    confidence: 'HIGH',
    paragraphs: [
      'Private travel is tilting toward beach and island markets today.',
      'Compared with yesterday, the move looks broader rather than one marquee surge.',
      'News blurbs from Mykonos add credibility to the private-arrival push.',
      'Watch whether the same destinations hold rank tomorrow.',
    ],
    signalChips: [
      { label: 'HEATING', value: '10', tone: 'heating' },
      { label: 'COOLING', value: '4', tone: 'cooling' },
    ],
    drivers: [
      { label: 'BREADTH', value: 'WIDER HEAT', detail: 'Multiple clusters are participating.', tone: 'heating' },
      { label: 'NEWS LAYER', value: 'SUPPORTED', detail: 'Headlines align with arrivals.', tone: 'steady' },
      { label: 'WATCH NEXT', value: 'HOLDING RANK', detail: 'Leaders need to repeat tomorrow.', tone: 'neutral' },
    ],
  });
  assert.equal(result.ok, true);
});

test('parseDailyTapeJsonFromModelText handles fenced JSON', () => {
  const draft = parseDailyTapeJsonFromModelText('```json\n{"headline":"The Daily Tape","verdict":"HEATING"}\n```');
  assert.equal(draft.headline, 'The Daily Tape');
  assert.equal(draft.verdict, 'HEATING');
});

test('normalizeDailyTapeBrief builds collapsedText and chips fallback', () => {
  const brief = normalizeDailyTapeBrief({
    headline: 'The Daily Tape',
    verdict: 'HEATING',
    confidence: 'MEDIUM',
    paragraphs: ['First paragraph.', 'Second paragraph.', 'Third paragraph.'],
    drivers: [
      { label: 'BREADTH', value: 'WIDE', detail: 'Broad heat.', tone: 'heating' },
      { label: 'WATCH NEXT', value: 'RANK', detail: 'Hold rank.', tone: 'neutral' },
    ],
  }, SAMPLE_INPUT);

  assert.equal(brief.verdict, 'HEATING');
  assert.equal(brief.updatedLabel, 'UPDATED 14:00Z');
  assert.equal(brief.collapsedText, 'First paragraph. Second paragraph. Third paragraph.');
  assert.ok(brief.signalChips.some((c) => c.label === 'HEATING' && c.value === '10'));
  assert.ok(brief.signalChips.some((c) => c.label === 'ARRIVALS' && c.value === '1744'));
});

test('buildDailyTapePrompt embeds input JSON', () => {
  const prompt = buildDailyTapePrompt(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, SAMPLE_INPUT);
  assert.match(prompt, /TODAY'S MOVEMENT INPUT/);
  assert.match(prompt, /"mykonos"/);
});

test('buildSignalChipsFromInput formats arrivals count', () => {
  const chips = buildSignalChipsFromInput(SAMPLE_INPUT);
  assert.deepEqual(
    chips.find((c) => c.label === 'ARRIVALS'),
    { label: 'ARRIVALS', value: '1744', tone: 'steady' },
  );
});

test('enrichTodayMovementInputWithNewsFromKv attaches blurb and headlines', async () => {
  const fakeKv = {
    async get() {
      return {
        destinations: [
          {
            destination_id: 'mykonos',
            publishable: true,
            generator_version: 'news_v2',
            generated_at: '2026-06-27T10:00:00.000Z',
            expires_at: '2026-06-28T10:00:00.000Z',
            blurb: 'Fresh hospitality openings are lining up with early private arrivals.',
            citations: [
              { title: 'Mykonos opens for the season', domain: 'example.com', url: 'https://example.com/a' },
              { title: 'Luxury hotels report strong bookings', domain: 'example.org', url: 'https://example.org/b' },
            ],
          },
        ],
      };
    },
  };

  const input = {
    ...SAMPLE_INPUT,
    destinations: [
      { id: 'mykonos', name: 'Mykonos', status: 'heating', goTangoScore: 88 },
      { id: 'aspen', name: 'Aspen', status: 'cooling', goTangoScore: 55 },
    ],
  };

  const enriched = await enrichTodayMovementInputWithNewsFromKv(input, fakeKv, { limit: 3 });
  const mykonos = enriched.destinations.find((d) => d.id === 'mykonos');
  assert.match(mykonos.aiNewsBlurb, /Fresh hospitality openings/);
  assert.deepEqual(mykonos.sourceHeadlines, [
    'Mykonos opens for the season',
    'Luxury hotels report strong bookings',
  ]);
});

test('index.html wires Daily Tape AI fetch and news enrichment', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /\/api\/get-daily-tape/);
  assert.match(html, /enrichTodayMovementInputWithNews/);
  assert.match(html, /fetchDailyTapeBriefFromApi/);
  assert.match(html, /await refreshTodayMovementDailyTape/);
});
