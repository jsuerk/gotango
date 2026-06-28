import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TODAY_MOVEMENT_LLM_SYSTEM_PROMPT,
  DAILY_TAPE_KV_KEYS,
  buildDailyTapePrompt,
  buildSignalChipsFromInput,
  buildTodayMovementInputFromSourceData,
  normalizeDailyTapeBrief,
  parseDailyTapeJsonFromModelText,
  validateDailyTapeDraft,
  validateTodayMovementInput,
  enrichTodayMovementInputWithNewsFromKv,
  persistDailyTapeToKv,
  readDailyTapeFromKvRecord,
  getDailyTapeFromKv,
  refreshDailyTapeCache,
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
  // Use timestamps relative to now so the fixture never expires under a moving clock.
  const generatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const fakeKv = {
    async get() {
      return {
        destinations: [
          {
            destination_id: 'mykonos',
            publishable: true,
            generator_version: 'news_v2',
            generated_at: generatedAt,
            expires_at: expiresAt,
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

test('index.html renders Daily Tape immediately and upgrades from cached GET', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /\/api\/get-daily-tape/);
  assert.match(html, /upgradeTodayMovementDailyTapeBrief/);
  assert.match(html, /fetchDailyTapeBriefFromApi/);
  assert.match(html, /refreshTodayMovementDailyTape\(arrivalsData, goTangoScoreV2Data\)/);
  assert.doesNotMatch(html, /await refreshTodayMovementDailyTape/);
  // The brief is fetched (GET cached), never POSTed/generated per user.
  assert.doesNotMatch(html, /method:\s*'POST',\s*headers:\s*\{\s*'Content-Type': 'application\/json' \},\s*body: JSON\.stringify\(\{\s*systemPrompt/);
});

test('buildTodayMovementInputFromSourceData maps score response to input', () => {
  const scoreResponse = {
    total_destinations: 51,
    now_minimum_public_score: 60,
    source_saved_at: '2026-06-27T14:00:00.000Z',
    destinations: [
      { id: 'mykonos', name: 'Mykonos', go_tango_score: 88, now_heating_display_eligible: true, now_cooling_display_eligible: false, raw_ga_arrivals_24h: 30 },
      { id: 'st-tropez', name: 'St. Tropez', go_tango_score: 81, now_heating_display_eligible: true, now_cooling_display_eligible: false },
      { id: 'low-score', name: 'Low Score', go_tango_score: 40, now_heating_display_eligible: true, now_cooling_display_eligible: false },
      { id: 'aspen', name: 'Aspen', go_tango_score: 66, now_heating_display_eligible: false, now_cooling_display_eligible: true },
    ],
  };
  const input = buildTodayMovementInputFromSourceData({
    arrivalsPayload: { saved_at: '2026-06-27T14:00:00.000Z' },
    scoreResponse,
    homepage: { totals: { total_private_arrivals_24h: 1744 } },
  });

  assert.equal(input.destinationCount, 51);
  // low-score (40) is excluded by the minimum public score of 60.
  assert.equal(input.heatingCount, 2);
  assert.equal(input.coolingCount, 1);
  assert.equal(input.privateArrivals24h, 1744);
  assert.equal(input.updatedAt, 'UPDATED 14:00Z');
  const heatingNames = input.destinations.filter((d) => d.status === 'heating').map((d) => d.name);
  assert.deepEqual(heatingNames, ['Mykonos', 'St. Tropez']);
  const validation = validateTodayMovementInput(input);
  assert.equal(validation.ok, true);
});

test('Daily Tape KV save/read round-trips a brief', async () => {
  const store = new Map();
  const fakeKv = {
    async set(key, value) { store.set(key, value); },
    async get(key) { return store.has(key) ? store.get(key) : null; },
  };

  const empty = await getDailyTapeFromKv(fakeKv);
  assert.equal(empty.ok, false);

  const brief = {
    headline: 'The Daily Tape',
    verdict: 'HEATING',
    confidence: 'MEDIUM',
    paragraphs: ['One.', 'Two.', 'Three.'],
    collapsedText: 'One. Two. Three.',
    signalChips: [],
    drivers: [],
  };
  const record = await persistDailyTapeToKv(fakeKv, {
    brief,
    generator: 'daily-tape-llm',
    todayDate: '2026-06-27',
    sourceSavedAt: '2026-06-27T14:00:00.000Z',
  });
  assert.equal(record.today_date, '2026-06-27');
  assert.equal(record.source_saved_at, '2026-06-27T14:00:00.000Z');
  assert.equal(store.get(DAILY_TAPE_KV_KEYS.latest).brief.verdict, 'HEATING');

  const hit = await getDailyTapeFromKv(fakeKv);
  assert.equal(hit.ok, true);
  assert.equal(hit.brief.headline, 'The Daily Tape');
  assert.equal(hit.generator, 'daily-tape-llm');
  // Snapshot tag survives the round-trip so refreshes stay idempotent per pull.
  assert.equal(hit.source_saved_at, '2026-06-27T14:00:00.000Z');
});

test('readDailyTapeFromKvRecord rejects empty records and exposes source snapshot', () => {
  assert.equal(readDailyTapeFromKvRecord(null).ok, false);
  assert.equal(readDailyTapeFromKvRecord({}).ok, false);
  const read = readDailyTapeFromKvRecord({ brief: { headline: 'x' }, source_saved_at: 'snap-1' });
  assert.equal(read.ok, true);
  assert.equal(read.source_saved_at, 'snap-1');
});

test('refreshDailyTapeCache is exported for the pull + cron pathways', () => {
  assert.equal(typeof refreshDailyTapeCache, 'function');
});

function makeDailyTapeTestKv() {
  const store = new Map();
  return {
    store,
    async set(key, value) { store.set(key, value); },
    async get(key) { return store.has(key) ? store.get(key) : null; },
  };
}

const FAKE_SOURCE = {
  arrivalsPayload: { saved_at: '2026-06-28T14:00:00.000Z', total_arrivals_across_all: 1200 },
  homepage: { totals: { total_private_arrivals_24h: 1200 } },
  scoreResponse: {
    total_destinations: 51,
    now_minimum_public_score: 60,
    source_saved_at: '2026-06-28T14:00:00.000Z',
    destinations: [
      { id: 'mykonos', name: 'Mykonos', go_tango_score: 88, now_heating_display_eligible: true, now_cooling_display_eligible: false },
    ],
  },
};

function fakeGenerate(headline) {
  return async ({ input }) => ({
    ok: true,
    generator: 'daily-tape-llm',
    llm_error: null,
    input,
    brief: {
      headline,
      verdict: 'HEATING',
      confidence: 'MEDIUM',
      paragraphs: ['P1.', 'P2.', 'P3.'],
      collapsedText: 'P1. P2. P3.',
      signalChips: [],
      drivers: [],
    },
  });
}

test('refreshDailyTapeCache generates, tags the snapshot, then stays idempotent', async () => {
  const kvClient = makeDailyTapeTestKv();
  const loadSourceData = async () => FAKE_SOURCE;

  const first = await refreshDailyTapeCache(kvClient, {
    apiKey: 'test-key',
    loadSourceData,
    generate: fakeGenerate('First article'),
  });
  assert.equal(first.ok, true);
  assert.equal(first.skipped, false);
  assert.equal(first.record.source_saved_at, '2026-06-28T14:00:00.000Z');
  assert.equal(kvClient.store.get(DAILY_TAPE_KV_KEYS.latest).brief.headline, 'First article');

  // Same snapshot -> skip, and crucially does NOT call generate again.
  const second = await refreshDailyTapeCache(kvClient, {
    apiKey: 'test-key',
    loadSourceData,
    generate: async () => { throw new Error('should not regenerate for same snapshot'); },
  });
  assert.equal(second.ok, true);
  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'already_generated_for_snapshot');
  assert.equal(kvClient.store.get(DAILY_TAPE_KV_KEYS.latest).brief.headline, 'First article');
});

test('refreshDailyTapeCache skips a second article on the same day even without a snapshot tag', async () => {
  const kvClient = makeDailyTapeTestKv();
  // Seed a brief for today that predates snapshot tagging (source_saved_at null).
  await persistDailyTapeToKv(kvClient, {
    brief: { headline: 'Earlier today', verdict: 'HEATING', paragraphs: ['x'], collapsedText: 'x', signalChips: [], drivers: [] },
    generator: 'daily-tape-llm',
    todayDate: '2026-06-28',
    sourceSavedAt: null,
  });

  const result = await refreshDailyTapeCache(kvClient, {
    apiKey: 'test-key',
    loadSourceData: async () => FAKE_SOURCE,
    generate: async () => { throw new Error('should not regenerate twice in one day'); },
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'already_generated_today');
});

test('refreshDailyTapeCache force regenerates regardless of cache', async () => {
  const kvClient = makeDailyTapeTestKv();
  await persistDailyTapeToKv(kvClient, {
    brief: { headline: 'Stale', verdict: 'HEATING', paragraphs: ['x'], collapsedText: 'x', signalChips: [], drivers: [] },
    generator: 'daily-tape-llm',
    todayDate: '2026-06-28',
    sourceSavedAt: '2026-06-28T14:00:00.000Z',
  });

  const forced = await refreshDailyTapeCache(kvClient, {
    force: true,
    apiKey: 'test-key',
    loadSourceData: async () => FAKE_SOURCE,
    generate: fakeGenerate('Forced fresh article'),
  });
  assert.equal(forced.skipped, false);
  assert.equal(forced.brief.headline, 'Forced fresh article');
  assert.equal(kvClient.store.get(DAILY_TAPE_KV_KEYS.latest).brief.headline, 'Forced fresh article');
});

test('fetch-all-arrivals regenerates the Daily Take after saving the snapshot', () => {
  const src = readFileSync(new URL('../api/fetch-all-arrivals.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ refreshDailyTapeCache \} from '\.\.\/daily-tape\.lib\.js'/);
  assert.match(src, /regenerateDailyTapeInline/);
  // Must only run after a successful KV save so it uses fresh data.
  assert.match(src, /if \(responseBody\.kv_saved\)/);
});

test('refresh-daily-tape endpoint supports idempotent + forced refresh', () => {
  const src = readFileSync(new URL('../api/refresh-daily-tape.js', import.meta.url), 'utf8');
  assert.match(src, /refreshDailyTapeCache/);
  assert.match(src, /parseForce/);
  assert.match(src, /skipped/);
});

test('publish:daily-tape script targets refresh endpoint and forces regeneration', () => {
  const script = readFileSync(new URL('../scripts/publish-daily-tape.mjs', import.meta.url), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(script, /\/api\/refresh-daily-tape/);
  assert.match(script, /DAILY_TAPE_BUILD_SECRET/);
  assert.match(script, /force=1/);
  assert.equal(pkg.scripts['publish:daily-tape'], 'node scripts/publish-daily-tape.mjs');
});
