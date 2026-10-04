// Fails when the API report changed against API_BASE_REF (default origin/beta) but API_VERSION did not.
const { execFileSync } = require('child_process');
const fs = require('fs');

const REPORT = 'api-report/atlas-vtt-api.d.ts';
const VERSION_LINE = /^export declare const API_VERSION = "([^"]+)";$/m;
const base = process.env.API_BASE_REF || 'origin/beta';

function baseReport() {
  try {
    return execFileSync('git', ['show', `${base}:${REPORT}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null; // no report at the base yet: the first API PR
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
