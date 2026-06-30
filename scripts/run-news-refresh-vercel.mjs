#!/usr/bin/env node
/**
 * Run destination news refresh to completion using vercel curl (production auth).
 *
 * Usage:
 *   node scripts/run-news-refresh-vercel.mjs
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function vercelCurl(path) {
  const result = spawnSync('vercel', ['curl', '--yes', path], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, VERCEL_CLI_NON_INTERACTIVE: '1' },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'vercel curl failed');
  }
  const jsonStart = result.stdout.lastIndexOf('{');
  if (jsonStart === -1) {
    throw new Error(`No JSON in vercel curl output: ${result.stdout.slice(-300)}`);
  }
  return JSON.parse(result.stdout.slice(jsonStart));
}

function isDone(data) {
  if (data?.skipped && data?.completed) return true;
  if (data?.completed && (data?.pending_remaining == null || data.pending_remaining === 0)) {
    return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('News refresh via vercel curl (production)');

  for (let batch = 1; batch <= 50; batch += 1) {
    const path =
      batch === 1
        ? '/api/refresh-all-destination-news?force=1'
        : '/api/refresh-all-destination-news?continue=1';

    console.log(`\n--- batch ${batch} ---`);
    const data = vercelCurl(path);
    console.log(
      `ok=${data.ok} completed=${data.completed} pending=${data.pending_remaining ?? '—'} `
      + `attempted=${data.attempted ?? '—'} publishable=${data.publishable_count ?? '—'} `
      + `rejected=${data.rejected_count ?? '—'} failed=${data.failed_count ?? '—'} `
      + `skipped=${data.skipped_count ?? '—'} duration_ms=${data.duration_ms ?? '—'}`,
    );
    if (data.error) console.log(`error: ${data.error}`);

    if (data.error === 'lock_contended') {
      console.log('Lock contended; retrying in 5s...');
      await sleep(5000);
      batch -= 1;
      continue;
    }

    if (isDone(data)) {
      console.log('\nNews refresh complete.');
      return;
    }

    await sleep(2000);
  }

  console.error('Stopped after 50 batches without completion.');
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
