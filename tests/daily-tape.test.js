import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TODAY_MOVEMENT_LLM_SYSTEM_PROMPT,
  DAILY_TAPE_KV_KEYS,
  DAILY_TAPE_PROMPT_VERSION,
  GOTANGO_VOICE_GUIDE,
  TODAYS_MOVEMENT_HUMAN_EDITOR_VOICE,
  DAILY_TAPE_HUMAN_EDITOR_REWRITE_INSTRUCTION,
  buildDailyTapePrompt,
  buildDailyTapeDestinationRoles,
  buildDriversFromInput,
  buildSignalChipsFromInput,
  buildTodayMovementInputFromSourceData,
  buildDailyTapeUserMessage,
  findForbiddenDailyTapeCopyPhrases,
  findBoringDailyTapeCopyIssues,
  findLeadershipMisattributions,
  getDailyTapeScoreLeaders,
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

test('TODAY_MOVEMENT_LLM_SYSTEM_PROMPT forbids MATTERS and requires accessible Today’s Movement copy', () => {
  assert.match(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /Today’s Movement for GoTango/);
  assert.match(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /Do not use “MATTERS” as a verdict label/);
  assert.match(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /Use “HEATING” as the primary positive verdict label/);
  assert.match(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /Looking Forward/);
  assert.match(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /private arrivals/);
  assert.match(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /GoTango Score leadership rule/);
  assert.match(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /smart but not stiff/);
  assert.match(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /Human-editor rule/);
  assert.match(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /Start with the day’s tension/);
  assert.equal(DAILY_TAPE_PROMPT_VERSION, 'daily_tape_human_editor_v5');
  assert.doesNotMatch(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /Daily Tape writer/);
  assert.doesNotMatch(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT, /private travel today/);
});

const SCORE_LEADER_INPUT = {
  todayDate: '2026-06-28',
  updatedAt: 'UPDATED 14:00Z',
  destinationCount: 51,
  heatingCount: 3,
  coolingCount: 1,
  scoreLeaders: [
    { id: 'hamptons', name: 'Hamptons', goTangoScore: 99 },
    { id: 'nantucket', name: 'Nantucket', goTangoScore: 97 },
    { id: 'nassau', name: 'Nassau', goTangoScore: 91 },
  ],
  destinations: [
    { id: 'nassau', name: 'Nassau', status: 'heating', goTangoScore: 91 },
    { id: '30a', name: '30A', status: 'heating', goTangoScore: 88 },
    { id: 'olbia', name: 'Sardinia / Olbia', status: 'heating', goTangoScore: 85 },
    { id: 'aspen', name: 'Aspen', status: 'cooling', goTangoScore: 55 },
  ],
};

function makeScoreLedDraft(headline, leadParagraph) {
  return {
    headline,
    verdict: 'HEATING',
    confidence: 'HIGH',
    paragraphs: [
      leadParagraph || 'Hamptons holds the top GoTango score today, while Nassau and 30A gain momentum.',
      'Compared with yesterday, the move looks broader rather than one marquee surge.',
      'Destination news adds texture through hospitality openings and seasonal programming.',
      'Looking forward, watch whether the heating names keep climbing or fade.',
    ],
    signalChips: [{ label: 'HEATING', value: '3', tone: 'heating' }],
    drivers: [
      { label: 'BREADTH', value: 'WIDER HEAT', detail: 'Multiple clusters are participating.', tone: 'heating' },
      { label: 'WATCH NEXT', value: 'HOLDING RANK', detail: 'Leaders need to repeat tomorrow.', tone: 'neutral' },
    ],
  };
}

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
    headline: 'Nassau grabs the spotlight as 30A and Aspen keep pace',
    verdict: 'HEATING',
    confidence: 'HIGH',
    paragraphs: [
      'Today’s read has a clear summer shape, with Nassau out front and several beach destinations adding momentum.',
      'Compared with yesterday, the move looks broader rather than one marquee surge.',
      'Destination news from Mykonos adds texture through hospitality openings and seasonal programming.',
      'Looking forward, watch whether today’s leaders hold rank or whether the heat rotates into the next cluster of summer routes.',
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

test('validateDailyTapeDraft rejects forbidden user-facing copy', () => {
  const result = validateDailyTapeDraft({
    headline: 'The Daily Tape is heating up',
    verdict: 'HEATING',
    confidence: 'HIGH',
    paragraphs: [
      'Private travel is tilting toward beach markets today.',
      'Compared with yesterday, the move looks broader.',
      'News blurbs add credibility to the private-arrival push.',
      'Watch whether leaders hold rank tomorrow.',
    ],
    signalChips: [{ label: 'HEATING', value: '10', tone: 'heating' }],
    drivers: [
      { label: 'BREADTH', value: 'WIDE', detail: 'Broad move.', tone: 'heating' },
      { label: 'WATCH NEXT', value: 'RANK', detail: 'Hold rank.', tone: 'neutral' },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => String(e).startsWith('forbidden_copy:')));
});

test('validateDailyTapeDraft rejects private arrivals phrasing', () => {
  const result = validateDailyTapeDraft({
    headline: 'Beach markets lead the board',
    verdict: 'HEATING',
    confidence: 'HIGH',
    paragraphs: [
      'Private arrivals are clustering at summer beach destinations today.',
      'Compared with yesterday, the move looks broader.',
      'Destination news adds texture to the arrival movement.',
      'Looking forward, watch whether leaders hold rank tomorrow.',
    ],
    signalChips: [{ label: 'HEATING', value: '10', tone: 'heating' }],
    drivers: [
      { label: 'BREADTH', value: 'WIDE', detail: 'Broad move.', tone: 'heating' },
      { label: 'WATCH NEXT', value: 'RANK', detail: 'Hold rank.', tone: 'neutral' },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => String(e).startsWith('forbidden_copy:')));
  assert.ok(result.errors.some((e) => /private arrivals/i.test(String(e))));
});

test('findForbiddenDailyTapeCopyPhrases ignores tape inside unrelated words', () => {
  assert.deepEqual(findForbiddenDailyTapeCopyPhrases('The landscape is shifting'), []);
  assert.ok(findForbiddenDailyTapeCopyPhrases('the tape is hot').includes('the tape'));
  assert.ok(findForbiddenDailyTapeCopyPhrases('private arrivals rose today').includes('private arrivals'));
  assert.ok(findForbiddenDailyTapeCopyPhrases('each private arrival matters').includes('private arrival'));
});

test('getDailyTapeScoreLeaders ranks by GoTango Score, not heating status', () => {
  const leaders = getDailyTapeScoreLeaders(SCORE_LEADER_INPUT);
  assert.equal(leaders[0].name, 'Hamptons');
  assert.equal(leaders[0].goTangoScore, 99);
  assert.equal(leaders[1].name, 'Nantucket');
});

test('findLeadershipMisattributions flags only non-top-score leadership phrasing', () => {
  // Nassau is heating but not the top GoTango Score (Hamptons 99) -> flagged.
  assert.deepEqual(findLeadershipMisattributions('Nassau leads the way today', SCORE_LEADER_INPUT), ['Nassau']);
  // Top-score destination may lead.
  assert.deepEqual(findLeadershipMisattributions('Hamptons leads the way as Nassau heats up', SCORE_LEADER_INPUT), []);
  // Momentum framing for a non-top destination is allowed.
  assert.deepEqual(findLeadershipMisattributions('Nassau heats up behind the leaders', SCORE_LEADER_INPUT), []);
});

test('validateDailyTapeDraft rejects a heating destination described as the leader (screenshot scenario)', () => {
  // Hamptons 99, Nantucket 97, Nassau 91 heating. Headline must not crown Nassau.
  const result = validateDailyTapeDraft(
    makeScoreLedDraft('Nassau leads the way as 30A and Olbia heat up'),
    SCORE_LEADER_INPUT,
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => String(e).startsWith('leadership_misattribution:')));
  assert.ok(result.errors.some((e) => /Nassau/.test(String(e))));
});

test('validateDailyTapeDraft accepts score-led headline that frames Nassau as momentum', () => {
  const result = validateDailyTapeDraft(
    makeScoreLedDraft('Hamptons holds the top spot as Nassau heats up behind the leaders'),
    SCORE_LEADER_INPUT,
  );
  assert.equal(result.ok, true);
});

test('validateDailyTapeDraft allows Nassau to lead when it has the top GoTango Score', () => {
  const nassauTopInput = {
    ...SCORE_LEADER_INPUT,
    scoreLeaders: [
      { id: 'nassau', name: 'Nassau', goTangoScore: 99 },
      { id: 'hamptons', name: 'Hamptons', goTangoScore: 95 },
    ],
    destinations: [
      { id: 'nassau', name: 'Nassau', status: 'heating', goTangoScore: 99 },
      { id: '30a', name: '30A', status: 'heating', goTangoScore: 88 },
    ],
  };
  const result = validateDailyTapeDraft(
    makeScoreLedDraft('Nassau leads the way as 30A heats up'),
    nassauTopInput,
  );
  assert.equal(result.ok, true);
});

test('findForbiddenDailyTapeCopyPhrases rejects required banned phrases', () => {
  const checks = [
    ['Daily Tape', 'The Daily Tape is heating'],
    ['private travel', 'private travel is up'],
    ['private arrivals', 'private arrivals rose today'],
    ['the tape', 'the tape is hot'],
    ['travel tape', 'travel tape update'],
    ['private aviation', 'private aviation demand'],
  ];
  for (const [label, text] of checks) {
    const hits = findForbiddenDailyTapeCopyPhrases(text);
    assert.ok(hits.length, `expected "${label}" to be flagged in: ${text}`);
  }
});

test('findBoringDailyTapeCopyIssues flags mechanical Today’s Movement headlines', () => {
  const boring = findBoringDailyTapeCopyIssues(
    makeScoreLedDraft('Today’s movement is broad across several destinations'),
    SCORE_LEADER_INPUT,
  );
  assert.ok(boring.includes('boring_headline_opener'));
  assert.ok(boring.includes('boring_headline_no_destinations'));
});

test('findBoringDailyTapeCopyIssues accepts a destination-led headline with tension', () => {
  const issues = findBoringDailyTapeCopyIssues(
    makeScoreLedDraft('Hamptons is still the name to beat, but Nassau is making the day interesting'),
    SCORE_LEADER_INPUT,
  );
  assert.equal(issues.length, 0);
});

test('findBoringDailyTapeCopyIssues flags clinical list-style headlines', () => {
  const issues = findBoringDailyTapeCopyIssues(
    makeScoreLedDraft('Hamptons stays on top as Nassau, Sardinia / Olbia and 30A keep heating up'),
    SCORE_LEADER_INPUT,
  );
  assert.ok(issues.includes('boring_headline_no_relationship'));
});

test('findBoringDailyTapeCopyIssues flags clinical metric-first openings', () => {
  const issues = findBoringDailyTapeCopyIssues(
    makeScoreLedDraft(
      'Hamptons is still the name to beat, but Nassau is making the day interesting',
      'Hamptons still holds the highest GoTango Score, but the more interesting story today is the wave just behind it.',
    ),
    SCORE_LEADER_INPUT,
  );
  assert.ok(issues.some((issue) => issue === 'boring_body_no_point_of_view' || issue === 'boring_body_clinical_terms'));
});

test('findBoringDailyTapeCopyIssues accepts human-editor opening sentences', () => {
  const issues = findBoringDailyTapeCopyIssues(
    makeScoreLedDraft(
      'Hamptons is still the name to beat, but Nassau is making the day interesting',
      'Hamptons is still the name to beat, with Nantucket close enough to keep pressure on the top of the board.',
    ),
    SCORE_LEADER_INPUT,
  );
  assert.equal(issues.length, 0);
});

test('buildDailyTapeDestinationRoles classifies leader, pressure, and momentum stories', () => {
  const roles = buildDailyTapeDestinationRoles(SCORE_LEADER_INPUT);
  assert.equal(roles.leader?.name, 'Hamptons');
  assert.ok(roles.pressure.some((d) => d.name === 'Nantucket'));
  assert.ok(roles.momentumStories.some((d) => d.name === 'Nassau'));
  assert.ok(!roles.momentumStories.some((d) => d.name === 'Hamptons'));
});

test('buildDailyTapeUserMessage surfaces GoTango Score leaders ahead of heating momentum', () => {
  const msg = buildDailyTapeUserMessage(SCORE_LEADER_INPUT);
  assert.match(msg, /GoTango Score leaders/);
  assert.match(msg, /1\. Hamptons — score 99/);
  assert.match(msg, /Heating momentum/);
  assert.match(msg, /GoTango Voice guidance/);
  assert.match(msg, /Human Editor Voice/);
  assert.match(msg, /Destination roles/);
  assert.match(msg, /Leader: Hamptons/);
  assert.match(msg, /Momentum stories:/);
  assert.match(msg, /Looking Forward paragraph/);
  assert.match(msg, /Evidence hierarchy/);
  assert.ok(msg.indexOf('GoTango Score leaders') < msg.indexOf('Heating momentum'));
  assert.ok(msg.indexOf('Destination roles') < msg.indexOf('Full structured input'));
});

test('GOTANGO_VOICE_GUIDE includes human editor guidance for Today\'s Movement', () => {
  assert.match(GOTANGO_VOICE_GUIDE, /destination-led/);
  assert.match(TODAYS_MOVEMENT_HUMAN_EDITOR_VOICE, /Start with the story, not the metric/);
  assert.match(TODAYS_MOVEMENT_HUMAN_EDITOR_VOICE, /Destination roles/);
});

test('human-editor rewrite instruction preserves facts and tension guidance', () => {
  assert.match(DAILY_TAPE_HUMAN_EDITOR_REWRITE_INSTRUCTION, /Start with the day['’]s tension/);
  assert.match(DAILY_TAPE_HUMAN_EDITOR_REWRITE_INSTRUCTION, /Use numbers as proof, not the lead/);
  assert.match(DAILY_TAPE_HUMAN_EDITOR_REWRITE_INSTRUCTION, /Give destinations roles instead of listing them/);
});

test('findBoringDailyTapeCopyIssues flags observed arrivals in generated prose', () => {
  const issues = findBoringDailyTapeCopyIssues({
    headline: 'Hamptons is still the name to beat, but Nassau is making the day interesting',
    verdict: 'HEATING',
    confidence: 'HIGH',
    paragraphs: [
      'Hamptons is still the name to beat, with observed arrivals clustering at summer beach destinations.',
      'This is not just one place having a good day.',
      'The calendar helps explain why.',
      'The next question is whether the challengers stay hot long enough to move the order.',
    ],
    signalChips: [{ label: 'HEATING', value: '3', tone: 'heating' }],
    drivers: [
      { label: 'BREADTH', value: 'WIDE', detail: 'Broad move.', tone: 'heating' },
      { label: 'WATCH NEXT', value: 'RANK', detail: 'Hold rank.', tone: 'neutral' },
    ],
  }, SCORE_LEADER_INPUT);
  assert.ok(issues.includes('boring_body_clinical_terms'));
});

test('parseDailyTapeJsonFromModelText handles fenced JSON', () => {
  const draft = parseDailyTapeJsonFromModelText('```json\n{"headline":"The Daily Tape","verdict":"HEATING"}\n```');
  assert.equal(draft.headline, 'The Daily Tape');
  assert.equal(draft.verdict, 'HEATING');
});

test('normalizeDailyTapeBrief builds collapsedText and chips fallback', () => {
  const brief = normalizeDailyTapeBrief({
    headline: 'Nassau leads today',
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

test('buildDriversFromInput always returns 2-4 valid drivers', () => {
  const drivers = buildDriversFromInput(SCORE_LEADER_INPUT);
  assert.ok(Array.isArray(drivers));
  assert.ok(drivers.length >= 2 && drivers.length <= 4);
  for (const d of drivers) {
    assert.ok(typeof d.label === 'string' && d.label.trim() !== '');
    assert.ok(typeof d.detail === 'string' && d.detail.trim() !== '');
  }
});

test('a draft missing drivers is repaired to a valid article (drivers are non-displayed metadata)', () => {
  // Simulate the flaky model miss that was blanking the live article: a valid
  // narrative but no drivers array. The deterministic repair must make it valid.
  const draft = makeScoreLedDraft(
    'Hamptons is still the name to beat, but Nassau is making the day interesting',
  );
  delete draft.drivers;
  const before = validateDailyTapeDraft(draft, SCORE_LEADER_INPUT);
  assert.equal(before.ok, false);
  assert.ok(before.errors.includes('drivers_count'));

  draft.drivers = buildDriversFromInput(SCORE_LEADER_INPUT, draft);
  draft.signalChips = buildSignalChipsFromInput(SCORE_LEADER_INPUT);
  const after = validateDailyTapeDraft(draft, SCORE_LEADER_INPUT);
  assert.equal(after.ok, true);
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
  // Score leaders are ranked by GoTango Score (>= min public score), independent
  // of heating/cooling status, and exclude the sub-threshold low-score entry.
  assert.ok(Array.isArray(input.scoreLeaders));
  assert.deepEqual(input.scoreLeaders.map((d) => d.name), ['Mykonos', 'St. Tropez', 'Aspen']);
  assert.equal(input.scoreLeaders[0].goTangoScore, 88);
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
    headline: 'Nassau leads today',
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
  assert.equal(record.prompt_version, DAILY_TAPE_PROMPT_VERSION);
  assert.equal(store.get(DAILY_TAPE_KV_KEYS.latest).brief.verdict, 'HEATING');

  const hit = await getDailyTapeFromKv(fakeKv);
  assert.equal(hit.ok, true);
  assert.equal(hit.brief.headline, 'Nassau leads today');
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

const BANNED_USER_FACING_PHRASE_CHECKS = [
  { label: 'Daily Tape', pattern: /\bdaily[\s-]tape\b/i },
  { label: 'private travel', pattern: /\bprivate travel\b/i },
  { label: 'private-travel', pattern: /\bprivate-travel\b/i },
  { label: 'private arrivals', pattern: /\bprivate arrivals\b/i },
  { label: 'private arrival', pattern: /\bprivate arrival\b/i },
  { label: 'private aviation', pattern: /\bprivate aviation\b/i },
  { label: 'the tape', pattern: /\bthe tape\b/i },
  { label: 'travel tape', pattern: /\btravel tape\b/i },
];

function extractTodayMovementFallbackCopy(html) {
  const block = html.match(/const FALLBACK_TODAY_MOVEMENT_BRIEF = \{([\s\S]*?)\n  \};/);
  assert.ok(block, 'FALLBACK_TODAY_MOVEMENT_BRIEF block missing');
  const headline = block[1].match(/headline:\s*'([^']+)'/);
  const paragraphs = [...block[1].matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]);
  return {
    headline: headline ? headline[1] : '',
    paragraphs,
  };
}

function extractTodayMovementPositivePromptExamples(prompt) {
  const section = prompt.match(/Good headline examples:\n([\s\S]*?)\n\nBad headline examples:/);
  if (!section) return [];
  return section[1]
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

test('Today’s Movement fallback copy and positive prompt examples avoid banned user-facing phrases', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const fallback = extractTodayMovementFallbackCopy(html);
  const positiveExamples = extractTodayMovementPositivePromptExamples(TODAY_MOVEMENT_LLM_SYSTEM_PROMPT);
  const samples = [
    fallback.headline,
    ...fallback.paragraphs,
    ...positiveExamples,
  ];

  for (const text of samples) {
    for (const check of BANNED_USER_FACING_PHRASE_CHECKS) {
      assert.doesNotMatch(
        text,
        check.pattern,
        `Unexpected "${check.label}" in user-facing Today’s Movement copy: ${text}`,
      );
    }
  }

  assert.match(fallback.headline, /name to beat/i);
  assert.match(fallback.headline, /making the day interesting/i);
  assert.doesNotMatch(fallback.headline, /stays on top as/i);
  assert.ok(
    fallback.paragraphs.some((p) => /next question|watch/i.test(p)),
    'fallback should include a Looking Forward idea',
  );
  assert.ok(
    fallback.paragraphs[0].includes('name to beat'),
    'fallback lead should open with story tension, not metric language',
  );
  for (const text of fallback.paragraphs) {
    assert.doesNotMatch(text, /\bobserved arrivals\b/i, `fallback should avoid observed arrivals: ${text}`);
  }
});
