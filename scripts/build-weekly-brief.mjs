#!/usr/bin/env node
/**
 * Build the weekly Brief manifest from live GoTango data + OpenAI editorial pass.
 *
 * Usage:
 *   node scripts/build-weekly-brief.mjs
 *   GOTANGO_API_BASE=https://gotango.co node scripts/build-weekly-brief.mjs
 *   node scripts/build-weekly-brief.mjs --issue-date 2026-06-23
 *   node scripts/build-weekly-brief.mjs --template-only
 *   node scripts/build-weekly-brief.mjs --remote --issue-date 2026-06-23
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  buildWeeklyBriefFactSheet,
  generateWeeklyBriefManifest,
  serializeWeeklyBriefConfig,
} from '../weekly-brief.lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CONFIG_PATH = resolve(ROOT, 'weekly-brief.config.js');

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

function parseArgs(argv) {
  const args = { templateOnly: false, remote: false, issueDate: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--template-only') args.templateOnly = true;
    if (argv[i] === '--remote') args.remote = true;
    if (argv[i] === '--issue-date' && argv[i + 1]) {
      args.issueDate = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} for ${url}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

async function loadSourceData(baseUrl) {
  const [arrivalsRes, scoreRes] = await Promise.all([
    fetchJson(`${baseUrl}/api/get-arrivals`),
    fetchJson(`${baseUrl}/api/get-gotango-score`),
  ]);

  if (!arrivalsRes?.ok || !arrivalsRes?.data) {
    throw new Error(arrivalsRes?.error || 'Arrivals API returned no data');
  }
  if (!scoreRes?.ok) {
    throw new Error(scoreRes?.error || 'GoTango score API returned not ok');
  }

  return {
    arrivalsPayload: {
      ...arrivalsRes.data,
      saved_at: arrivalsRes.data?.saved_at || arrivalsRes.meta?.saved_at || null,
    },
    homepage: arrivalsRes.data.homepage || null,
    scoreResponse: scoreRes,
  };
}

function buildRemotePath(args) {
  const params = new URLSearchParams({ format: 'config' });
  if (args.issueDate) params.set('issue_date', args.issueDate);
  if (args.templateOnly) params.set('template_only', '1');
  return `/api/build-weekly-brief?${params.toString()}`;
}

function readBearerSecret() {
  return process.env.WEEKLY_BRIEF_BUILD_SECRET?.trim()
    || process.env.CRON_SECRET?.trim()
    || '';
}

async function buildViaRemote(args) {
  const baseUrl = (process.env.GOTANGO_API_BASE || 'https://gotango.co').replace(/\/$/, '');
  const path = buildRemotePath(args);
  const secret = readBearerSecret();

  let configSource;
  if (secret) {
    console.log(`Calling remote brief builder at ${baseUrl} ...`);
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/javascript',
        Authorization: `Bearer ${secret}`,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Remote build failed (${response.status}): ${text.slice(0, 300)}`);
    }
    configSource = await response.text();
  } else {
    console.log('No local build secret — using vercel curl against linked project ...');
    const deployment = process.env.GOTANGO_PREVIEW_DEPLOYMENT || '';
    const curlArgs = deployment
      ? ['curl', '--yes', '--deployment', deployment, path]
      : ['curl', '--yes', path];
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
    configSource = result.stdout;
  }

  if (!configSource.includes('window.WEEKLY_BRIEF_MANIFEST')) {
    throw new Error('Remote build did not return a weekly brief config');
  }

  writeFileSync(CONFIG_PATH, configSource, 'utf8');
  console.log(`Wrote ${CONFIG_PATH} (remote)`);
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv);

  if (args.remote) {
    await buildViaRemote(args);
    return;
  }

  const baseUrl = (process.env.GOTANGO_API_BASE || 'https://gotango.co').replace(/\/$/, '');
  const issueDate = args.issueDate
    ? new Date(`${args.issueDate}T12:00:00Z`)
    : new Date();

  console.log(`Fetching data from ${baseUrl} ...`);
  const { arrivalsPayload, homepage, scoreResponse } = await loadSourceData(baseUrl);

  const factSheet = buildWeeklyBriefFactSheet({
    arrivalsPayload,
    scoreResponse,
    homepage,
    issueDate,
  });

  console.log(`Issue: ${factSheet.kicker}`);
  console.log(`Lead story: ${factSheet.lead_story?.name || 'none'}`);
  console.log(`Sleeper: ${factSheet.sleeper?.name || 'none'}`);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!args.templateOnly && !apiKey) {
    console.warn('OPENAI_API_KEY not set locally — trying remote Vercel builder ...');
    await buildViaRemote(args);
    return;
  }

  const { manifest, generator } = await generateWeeklyBriefManifest({
    factSheet,
    apiKey,
    templateOnly: args.templateOnly,
  });

  if (generator === 'weekly-brief-llm') {
    console.log('LLM brief validated.');
  } else {
    console.log('Using template fallback.');
  }

  const configSource = serializeWeeklyBriefConfig(manifest);
  writeFileSync(CONFIG_PATH, configSource, 'utf8');
  console.log(`Wrote ${CONFIG_PATH}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
