import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REJECTION_REASONS,
  partitionNewsRefreshBatchResults,
  shouldSkipDailyNewsRefresh,
  loadArrivalsSourceSavedAt,
} from '../news-context.lib.js';

test('loadArrivalsSourceSavedAt falls back to :meta when :latest lacks saved_at', async () => {
  // The arrivals :latest payload does not carry saved_at; it lives in :meta.
  const fakeKv = {
    async get(key) {
      if (key === 'gotango:arrivals:latest') {
        return { fetched_at: '2026-06-29T14:00:46.525Z' };
      }
      if (key === 'gotango:arrivals:meta') {
        return { saved_at: '2026-06-29T14:00:46.527Z' };
      }
      return null;
    },
  };
  const savedAt = await loadArrivalsSourceSavedAt(fakeKv);
  assert.equal(savedAt, '2026-06-29T14:00:46.527Z');
});

test('loadArrivalsSourceSavedAt prefers latest.saved_at, then meta, then fetched_at', async () => {
  const onlyFetched = {
    async get(key) {
      if (key === 'gotango:arrivals:latest') return { fetched_at: '2026-06-29T14:00:00.000Z' };
      return null;
    },
  };
  assert.equal(await loadArrivalsSourceSavedAt(onlyFetched), '2026-06-29T14:00:00.000Z');

  const empty = { async get() { return null; } };
  assert.equal(await loadArrivalsSourceSavedAt(empty), null);
});

test('news daily refresh no longer permanently skips once meta.saved_at is available', () => {
  // Regression guard: with a real (non-null) snapshot timestamp, a prior day's
  // completed run must not skip the next day via the null === null path.
  const priorState = { completed: true, source_saved_at: '2026-06-28T14:00:00.000Z', today_date: '2026-06-28' };
  const result = shouldSkipDailyNewsRefresh({
    force: false,
    state: priorState,
    sourceSavedAt: '2026-06-29T14:00:46.527Z',
    todayDate: '2026-06-29',
  });
  assert.equal(result.skip, false);
});

test('shouldSkipDailyNewsRefresh skips when snapshot already refreshed', () => {
  const result = shouldSkipDailyNewsRefresh({
    force: false,
    state: {
      completed: true,
      source_saved_at: '2026-06-29T14:00:00.000Z',
      today_date: '2026-06-29',
    },
    sourceSavedAt: '2026-06-29T14:00:00.000Z',
    todayDate: '2026-06-29',
  });

  assert.equal(result.skip, true);
  assert.equal(result.reason, 'already_refreshed_for_snapshot');
});

test('shouldSkipDailyNewsRefresh skips when UTC day already refreshed', () => {
  const result = shouldSkipDailyNewsRefresh({
    force: false,
    state: {
      completed: true,
      source_saved_at: null,
      today_date: '2026-06-29',
    },
    sourceSavedAt: '2026-06-29T14:05:00.000Z',
    todayDate: '2026-06-29',
  });

  assert.equal(result.skip, true);
  assert.equal(result.reason, 'already_refreshed_today');
});

test('shouldSkipDailyNewsRefresh does not skip when force is true', () => {
  const result = shouldSkipDailyNewsRefresh({
    force: true,
    state: {
      completed: true,
      source_saved_at: '2026-06-29T14:00:00.000Z',
      today_date: '2026-06-29',
    },
    sourceSavedAt: '2026-06-29T14:00:00.000Z',
    todayDate: '2026-06-29',
  });

  assert.equal(result.skip, false);
});

test('partitionNewsRefreshBatchResults keeps deadline-skipped destinations pending', () => {
  const pending = ['aspen', 'ibiza', 'cabo-san-lucas'];
  const results = [
    { destination_id: 'aspen', publishable: true },
    { destination_id: 'ibiza', rejection_reason: REJECTION_REASONS.FUNCTION_DEADLINE },
    { destination_id: 'cabo-san-lucas', publishable: false, rejection_reason: REJECTION_REASONS.SOURCE_QUALITY },
  ];

  assert.deepEqual(partitionNewsRefreshBatchResults(results, pending), ['ibiza']);
});
