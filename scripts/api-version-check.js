// Fails when the API report changed against API_BASE_REF but API_VERSION did not.
const { execFileSync } = require('child_process');
const fs = require('fs');

const REPORT = 'api-report/atlas-vtt-api.d.ts';
const VERSION_LINE = /^export declare const API_VERSION = "([^"]+)";$/m;
const base = process.env.API_BASE_REF;

if (process.env.API_CHECK_SKIP === '1') {
  console.warn('API_CHECK_SKIP=1: the API version check is skipped. Meant for local use only; CI must not set it.');
  process.exit(0);
}
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}
function fail(message) {
  console.error(`api-version-check: ${message} (set API_CHECK_SKIP=1 to skip locally.)`);
  process.exit(1);
}
if (!base) fail('API_BASE_REF is not set. Name the ref to compare against, for example origin/beta.');
try {
  git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
} catch {
  fail(`cannot resolve ${base}. Fetch it, and check the clone is not shallow (actions/checkout needs fetch-depth: 0).`);
}
function baseReport() {
  try {
    return git(['show', `${base}:${REPORT}`]);
  } catch {
    return null; // the base commit exists but holds no report yet: the first API PR
  }
}

const head = fs.readFileSync(REPORT, 'utf8').replace(/\r\n/g, '\n');
const before = baseReport()?.replace(/\r\n/g, '\n') ?? null;
if (before === null) process.exit(0);
const strip = (text) => text.replace(VERSION_LINE, '');
const headVersion = head.match(VERSION_LINE)?.[1];
const baseVersion = before.match(VERSION_LINE)?.[1];
if (strip(head) !== strip(before) && headVersion === baseVersion) {
  console.error(`The extension API changed against ${base} but API_VERSION is still ${headVersion}. Bump src/api/version.ts (docs/extension-api.md).`);
  process.exit(1);
}
