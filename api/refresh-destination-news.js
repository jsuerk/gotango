import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import { DESTINATION_NEWS_DESTINATION_COUNT, NEWS_PRICING_VERSION } from '../news-context.config.js';
import {
  NEWS_KV_KEYS,
  LOCK_TTL_SECONDS,
  aggregateRunMetrics,
  authorizeNewsRequest,
  compactDestinationSummary,
  compactRunSummary,
  getConfiguredModel,
  mergeLatestNews,
  parseDestinationNewsId,
  parseMaxOutputTokens,
  parseTtlHours,
  parseWorkerConcurrency,
  rejectUnknownQueryParams,
  runNewsWorkerPool,
} from '../news-context.lib.js';
import { getDestinationNewsConfigById } from '../news-context.config.js';

async function acquireRunLock(runId) {
  const acquiredAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + LOCK_TTL_SECONDS * 1000).toISOString();
  const lockPayload = {
    run_id: runId,
    acquired_at: acquiredAt,
    expires_at: expiresAt,
  };

  const result = await kv.set(NEWS_KV_KEYS.lock, lockPayload, {
    nx: true,
    ex: LOCK_TTL_SECONDS,
  });

  if (result !== 'OK' && result !== true) {
    return { acquired: false };
  }

  return { acquired: true, lockPayload };
}

async function releaseRunLock(runId) {
  try {
    const current = await kv.get(NEWS_KV_KEYS.lock);
    if (current && typeof current === 'object' && current.run_id === runId) {
      await kv.del(NEWS_KV_KEYS.lock);
    }
  } catch (err) {
    console.error('[refresh-destination-news] lock release skipped:', err);
  }
}

async function saveNewsResults({
  runId,
  startedAt,
  completedAt,
  durationMs,
  configuredModel,
  maxOutputTokens,
  attempted,
  metrics,
  results,
}) {
  const runSummary = compactRunSummary({
    runId,
    startedAt,
    completedAt,
    durationMs,
    configuredModel,
    maxOutputTokens,
    attempted,
    metrics,
  });

  const meta = {
    run_id: runId,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    configured_model: configuredModel,
    max_output_tokens: maxOutputTokens,
    attempted,
    completed: metrics.completedCount,
    publishable_count: metrics.publishableCount,
    rejected_count: metrics.rejectedCount,
    failed_count: metrics.failedCount,
    skipped_count: metrics.skippedCount,
    web_search_calls: metrics.totals.web_search_calls,
    input_tokens: metrics.totals.input_tokens,
    cached_input_tokens: metrics.totals.cached_input_tokens,
    output_tokens: metrics.totals.output_tokens,
    reasoning_tokens: metrics.totals.reasoning_tokens,
    total_tokens: metrics.totals.total_tokens,
    estimated_search_cost: metrics.totals.estimated_search_cost,
    estimated_model_cost: metrics.totals.estimated_model_cost,
    estimated_total_cost: metrics.totals.estimated_total_cost,
    pricing_version: runSummary.pricing_version,
    generator_version: runSummary.generator_version,
  };

  const existingLatest = await kv.get(NEWS_KV_KEYS.latest);
  const mergedLatest = mergeLatestNews(existingLatest, results, completedAt);

  for (const result of results) {
    await kv.set(NEWS_KV_KEYS.diagnostics(result.destination_id), result);
  }

  await kv.set(NEWS_KV_KEYS.latest, mergedLatest);
  await kv.set(NEWS_KV_KEYS.meta, meta);
  await kv.lpush(NEWS_KV_KEYS.runs, runSummary);
  await kv.ltrim(NEWS_KV_KEYS.runs, 0, 29);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const functionStartMs = Date.now();
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (process.env.NEWS_CONTEXT_ENABLED !== 'true') {
    return res.status(403).json({ ok: false, error: 'News context refresh is disabled' });
  }

  const auth = authorizeNewsRequest(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  const unknownParamError = rejectUnknownQueryParams(req, ['id']);
  if (unknownParamError) {
    return res.status(400).json({ ok: false, error: unknownParamError.error });
  }

  const idResult = parseDestinationNewsId(req.query?.id);
  if (idResult.error) {
    return res.status(400).json({ ok: false, error: idResult.error });
  }
  if (!idResult.id) {
    return res.status(400).json({ ok: false, error: 'Missing id query parameter.' });
  }

  const destination = getDestinationNewsConfigById(idResult.id);
  const destinations = [destination];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    return res.status(503).json({ ok: false, error: 'Service unavailable' });
  }

  const lock = await acquireRunLock(runId);
  if (!lock.acquired) {
    return res.status(409).json({ ok: false, error: 'News refresh already in progress' });
  }

  const configuredModel = getConfiguredModel();
  const maxOutputTokens = parseMaxOutputTokens();
  const ttlHours = parseTtlHours();
  const concurrency = parseWorkerConcurrency();

  try {
    const results = await runNewsWorkerPool({
      destinations,
      apiKey: String(apiKey).trim(),
      generatedAt: startedAt,
      ttlHours,
      functionStartMs,
      concurrency,
    });

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - functionStartMs;
    const metrics = aggregateRunMetrics(results);

    await saveNewsResults({
      runId,
      startedAt,
      completedAt,
      durationMs,
      configuredModel,
      maxOutputTokens,
      attempted: destinations.length,
      metrics,
      results,
    });

    return res.status(200).json({
      ok: true,
      run_id: runId,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      configured_model: configuredModel,
      max_output_tokens: maxOutputTokens,
      destination_news_destination_count: DESTINATION_NEWS_DESTINATION_COUNT,
      pilot_destination_count: DESTINATION_NEWS_DESTINATION_COUNT,
      attempted: destinations.length,
      completed: metrics.completedCount,
      publishable_count: metrics.publishableCount,
      rejected_count: metrics.rejectedCount,
      failed_count: metrics.failedCount,
      skipped_count: metrics.skippedCount,
      web_search_calls: metrics.totals.web_search_calls,
      input_tokens: metrics.totals.input_tokens,
      cached_input_tokens: metrics.totals.cached_input_tokens,
      output_tokens: metrics.totals.output_tokens,
      reasoning_tokens: metrics.totals.reasoning_tokens,
      total_tokens: metrics.totals.total_tokens,
      estimated_search_cost: metrics.totals.estimated_search_cost,
      estimated_model_cost: metrics.totals.estimated_model_cost,
      estimated_total_cost: metrics.totals.estimated_total_cost,
      pricing_version: NEWS_PRICING_VERSION,
      destinations: results.map((result) => compactDestinationSummary(result)),
    });
  } catch (err) {
    console.error('[refresh-destination-news] run failed:', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await releaseRunLock(runId);
  }
}
