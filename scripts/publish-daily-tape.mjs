#!/usr/bin/env node
/**
 * Publish Today's Movement (Daily Tape) to KV now.
 *
 * Usage:
 *   npm run publish:daily-tape
 *   GOTANGO_API_BASE=https://gotango.co npm run publish:daily-tape
 *   npm run publish:daily-tape -- --remote
 *
 * Auth (first match wins):
 *   DAILY_TAPE_BUILD_SECRET, WEEKLY_BRIEF_BUILD_SECRET, or CRON_SECRET in .env.local
 * Without a secret, --remote falls back to `vercel curl` against the linked project.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REFRESH_PATH = '/api/refresh-daily-tape';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key] && val) process.env[key] = val;
  }
}

function loadEnvLocal() {
  loadEnvFile(resolve(ROOT, '.env.local'));
  loadEnvFile(resolve(ROOT, '.vercel/.env.production.local'));
}

function readBearerSecret() {
  return process.env.DAILY_TAPE_BUILD_SECRET?.trim()
    || process.env.WEEKLY_BRIEF_BUILD_SECRET?.trim()
    || process.env.CRON_SECRET?.trim()
    || '';
}

function parseArgs(argv) {
  return { remote: argv.includes('--remote') };
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON response (${response.status}): ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data;
}

async function publishViaFetch(baseUrl, secret) {
  const url = `${baseUrl}${REFRESH_PATH}`;
  console.log(`Publishing Daily Tape via ${url} ...`);
  return fetchJson(url, {
    method: 'POST',
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
}

function publishViaVercelCurl() {
  console.log('No local build secret — using vercel curl against linked project ...');
  const deployment = process.env.GOTANGO_PREVIEW_DEPLOYMENT || '';
  const curlArgs = deployment
    ? ['curl', '--yes', '--deployment', deployment, REFRESH_PATH]
    : ['curl', '--yes', REFRESH_PATH];
  const result = spawnSync('vercel', curlArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      VERCEL_CLI_NON_INTERACTIVE: '1',
    },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'vercel curl failed');
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Unexpected vercel curl output: ${result.stdout.slice(0, 300)}`);
  }
}

function printResult(data) {
  if (data?.ok) {
    console.log('Daily Tape published.');
    console.log(`  saved_at: ${data.saved_at || '—'}`);
    console.log(`  today_date: ${data.today_date || '—'}`);
    console.log(`  verdict: ${data.verdict || '—'}`);
    console.log(`  generator: ${data.generator || '—'}`);
    return;
  }

  console.error('Daily Tape publish did not save a new brief.');
  if (data?.llm_error) console.error(`  llm_error: ${data.llm_error}`);
  if (data?.error) console.error(`  error: ${data.error}`);
  if (data?.heating_count != null) {
    console.error(`  heating_count: ${data.heating_count}, cooling_count: ${data.cooling_count}`);
  }
  process.exitCode = 1;
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv);
  const baseUrl = (process.env.GOTANGO_API_BASE || 'https://gotango.co').replace(/\/$/, '');
  const secret = readBearerSecret();

  let data;
  if (args.remote || !secret) {
    data = secret
      ? await publishViaFetch(baseUrl, secret)
      : publishViaVercelCurl();
  } else {
    data = await publishViaFetch(baseUrl, secret);
  }

  printResult(data);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
