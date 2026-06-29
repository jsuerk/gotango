import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REJECTION_REASONS,
  partitionNewsRefreshBatchResults,
  shouldSkipDailyNewsRefresh,
} from '../news-context.lib.js';

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
