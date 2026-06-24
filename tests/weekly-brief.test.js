import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildWeeklyBriefFactSheet,
  buildTemplateWeeklyBrief,
  formatBriefIssueDate,
  mergeBriefDestinations,
  parseBriefJsonFromModelText,
  pickBlendedLeadStory,
  validateWeeklyBriefDraft,
} from '../weekly-brief.lib.js';

test('formatBriefIssueDate produces Tuesday kicker', () => {
  const { kicker, iso } = formatBriefIssueDate(new Date('2026-06-23T12:00:00Z'));
  assert.equal(iso, '2026-06-23');
  assert.match(kicker, /TUESDAY, 23 JUNE/);
});

test('mergeBriefDestinations attaches v2 scores', () => {
  const merged = mergeBriefDestinations(
    {
      destinations: [
        { id: 'ibiza', ok: true, name: 'Ibiza', raw_ga_arrivals_24h: 40 },
      ],
    },
    {
      ok: true,
      destinations: [
        { id: 'ibiza', go_tango_score: 80, go_tango_score_points_7d: [49, 55, 60, 70, 75, 78, 80] },
      ],
    },
  );
  assert.equal(merged[0].go_tango_score, 80);
  assert.deepEqual(merged[0].go_tango_score_points_7d, [49, 55, 60, 70, 75, 78, 80]);
});

test('buildWeeklyBriefFactSheet selects blended lead', () => {
  const sheet = buildWeeklyBriefFactSheet({
    arrivalsPayload: {
      saved_at: '2026-06-23T00:00:00.000Z',
      destinations: [
        {
          id: 'ibiza', ok: true, name: 'Ibiza', region: 'Balearic Islands',
          raw_ga_arrivals_24h: 45, premium_private_arrivals_24h: 20, light_ga_arrivals_24h: 5,
          top_origins: [{ name: 'Nice', count: 8 }],
        },
        {
          id: 'mykonos', ok: true, name: 'Mykonos', region: 'Greek Islands',
          raw_ga_arrivals_24h: 30, premium_private_arrivals_24h: 12, light_ga_arrivals_24h: 2,
        },
      ],
    },
    scoreResponse: {
      ok: true,
      go_tango_score_version: '2.1',
      destinations: [
        { id: 'ibiza', go_tango_score: 80, go_tango_score_points_7d: [49, 55, 60, 70, 75, 78, 80], confirmed_category: 'heating_up', data_confidence: 'high' },
        { id: 'mykonos', go_tango_score: 77, go_tango_score_points_7d: [94, 95, 97, 90, 85, 80, 77], confirmed_category: 'in_season', data_confidence: 'high' },
      ],
    },
    homepage: { sleeper_pick: { id: 'santa-fe', ok: true, name: 'Santa Fe', raw_ga_arrivals_24h: 12 } },
    issueDate: new Date('2026-06-23T12:00:00Z'),
  });

  assert.equal(sheet.lead_story?.name, 'Ibiza');
  assert.equal(sheet.lead_story?.score_delta_7d, 31);
  assert.ok(sheet.sleeper?.name);
});

test('pickBlendedLeadStory prefers competitive US summer leader', () => {
  const hamptons = {
    id: 'hamptons', name: 'Hamptons', region_theme: 'us_summer',
    go_tango_score: 96, score_delta_7d: 4, data_quality_ok: true, data_confidence: 'high',
  };
  const dubai = {
    id: 'dubai-private', name: 'Dubai (Al Maktoum)', region_theme: 'other',
    go_tango_score: 99, score_delta_7d: 27, data_quality_ok: true, data_confidence: 'high',
  };
  const lead = pickBlendedLeadStory({
    scorePool: [dubai, hamptons],
    risers: [dubai, hamptons],
    usSummerStandouts: [hamptons],
  });
  assert.equal(lead.name, 'Hamptons');
});

test('pickBlendedLeadStory keeps global top when US summer is far behind', () => {
  const hamptons = {
    id: 'hamptons', name: 'Hamptons', region_theme: 'us_summer',
    go_tango_score: 82, score_delta_7d: 2, data_quality_ok: true, data_confidence: 'high',
  };
  const dubai = {
    id: 'dubai-private', name: 'Dubai (Al Maktoum)', region_theme: 'other',
    go_tango_score: 99, score_delta_7d: 27, data_quality_ok: true, data_confidence: 'high',
  };
  const lead = pickBlendedLeadStory({
    scorePool: [dubai, hamptons],
    risers: [dubai],
    usSummerStandouts: [hamptons],
  });
  assert.equal(lead.name, 'Dubai (Al Maktoum)');
});

test('buildWeeklyBriefFactSheet can lead with Hamptons over Dubai when competitive', () => {
  const sheet = buildWeeklyBriefFactSheet({
    arrivalsPayload: {
      saved_at: '2026-06-23T00:00:00.000Z',
      destinations: [
        {
          id: 'hamptons', ok: true, name: 'Hamptons', region: 'Hamptons',
          raw_ga_arrivals_24h: 120, premium_private_arrivals_24h: 80, light_ga_arrivals_24h: 10,
        },
        {
          id: 'dubai-private', ok: true, name: 'Dubai (Al Maktoum)', region: 'Dubai',
          raw_ga_arrivals_24h: 69, premium_private_arrivals_24h: 4, light_ga_arrivals_24h: 0,
        },
      ],
    },
    scoreResponse: {
      ok: true,
      destinations: [
        {
          id: 'hamptons', go_tango_score: 96, go_tango_score_points_7d: [92, 93, 94, 95, 95, 96, 96],
          confirmed_category: 'in_season', data_confidence: 'high',
        },
        {
          id: 'dubai-private', go_tango_score: 99, go_tango_score_points_7d: [72, 80, 85, 90, 94, 97, 99],
          confirmed_category: 'heating_up', data_confidence: 'high',
        },
      ],
    },
    homepage: {},
    issueDate: new Date('2026-06-23T12:00:00Z'),
  });

  assert.equal(sheet.lead_story?.name, 'Hamptons');
});

test('parseBriefJsonFromModelText handles fenced JSON', () => {
  const parsed = parseBriefJsonFromModelText('```json\n{"headline_before":"A ","headline_emphasis":"b."}\n```');
  assert.equal(parsed.headline_before, 'A ');
});

test('validateWeeklyBriefDraft requires core fields', () => {
  const factSheet = {
    lead_story: { name: 'Ibiza' },
    sleeper: { name: 'Santa Fe' },
    us_summer_standouts: [],
    caribbean_risers: [],
    caribbean_fallers: [],
    top_risers: [],
    top_fallers: [],
  };
  const bad = validateWeeklyBriefDraft({ paragraphs: [] }, factSheet);
  assert.equal(bad.ok, false);

  const good = validateWeeklyBriefDraft({
    headline_before: 'Ibiza leads ',
    headline_emphasis: 'now.',
    lede: 'Ibiza leads the week.',
    paragraphs: ['Ibiza moved.', 'Mykonos held.', 'Summer builds.'],
    sleeper: { title: 'Santa Fe', description: 'Santa Fe is building.' },
    closing: 'Watch Ibiza.',
  }, factSheet);
  assert.equal(good.ok, true);
});

test('buildTemplateWeeklyBrief produces renderable manifest', () => {
  const sheet = buildWeeklyBriefFactSheet({
    arrivalsPayload: {
      destinations: [{
        id: 'ibiza', ok: true, name: 'Ibiza', raw_ga_arrivals_24h: 45,
        premium_private_arrivals_24h: 20, light_ga_arrivals_24h: 5,
      }],
    },
    scoreResponse: {
      ok: true,
      destinations: [{
        id: 'ibiza', go_tango_score: 80, go_tango_score_points_7d: [49, 80],
        confirmed_category: 'heating_up', data_confidence: 'high',
      }],
    },
    homepage: {},
    issueDate: new Date('2026-06-23T12:00:00Z'),
  });
  const manifest = buildTemplateWeeklyBrief(sheet);
  assert.match(manifest.kicker, /JUNE/);
  assert.ok(manifest.paragraphs.length >= 1);
  assert.ok(manifest.sleeper.title);
});

test('index.html loads weekly brief manifest and renderer', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /weekly-brief\.config\.js/);
  assert.match(html, /function renderWeeklyBrief\(/);
  assert.match(html, /id="weekly-brief-root"/);
});
