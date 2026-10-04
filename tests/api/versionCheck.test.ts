import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve('scripts/api-version-check.js');
const report = (version: string, body: string): string => `export declare const API_VERSION = "${version}";\n${body}\n`;

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'api-check-'));
  const git = (...args: string[]): void => { execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, stdio: 'ignore' }); };
  git('init', '-q');
  mkdirSync(join(dir, 'api-report'));
  writeFileSync(join(dir, 'api-report/atlas-vtt-api.d.ts'), report('1.0.0', 'a'));
  git('add', '.');
  git('commit', '-qm', 'base');
  git('tag', 'base');
  return dir;
}

function run(dir: string, env: Record<string, string>): { status: number | null; stderr: string } {
  const clean = { ...process.env, ...env };
  if (!('API_BASE_REF' in env)) delete clean.API_BASE_REF;
  if (!('API_CHECK_SKIP' in env)) delete clean.API_CHECK_SKIP;
  const result = spawnSync('node', [script], { cwd: dir, env: clean, encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
}

describe('api-version-check', () => {
  it('fails closed when API_BASE_REF is missing', () => {
    const result = run(repo(), {});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('API_BASE_REF is not set');
  });

  it('fails closed when the base ref cannot be resolved', () => {
    const result = run(repo(), { API_BASE_REF: 'origin/nowhere' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot resolve origin/nowhere');
  });

  it('skips only with an explicit API_CHECK_SKIP=1', () => {
    expect(run(repo(), { API_CHECK_SKIP: '1' }).status).toBe(0);
  });

  it('passes when nothing changed, and fails when the report changed without a version bump', () => {
    const dir = repo();
    expect(run(dir, { API_BASE_REF: 'base' }).status).toBe(0);
    writeFileSync(join(dir, 'api-report/atlas-vtt-api.d.ts'), report('1.0.0', 'b'));
    expect(run(dir, { API_BASE_REF: 'base' }).status).toBe(1);
    writeFileSync(join(dir, 'api-report/atlas-vtt-api.d.ts'), report('1.1.0', 'b'));
    expect(run(dir, { API_BASE_REF: 'base' }).status).toBe(0);
  });

  it('passes when the base commit holds no report yet (the first API PR)', () => {
    const dir = repo();
    execFileSync('git', ['checkout', '-q', '--orphan', 'other'], { cwd: dir });
    execFileSync('git', ['rm', '-rqf', '.'], { cwd: dir });
    mkdirSync(join(dir, 'api-report'), { recursive: true });
    writeFileSync(join(dir, 'x'), 'x');
    execFileSync('git', ['add', 'x'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'noreport'], { cwd: dir });
    execFileSync('git', ['tag', 'noreport'], { cwd: dir });
    writeFileSync(join(dir, 'api-report/atlas-vtt-api.d.ts'), report('1.0.0', 'a'));
    expect(run(dir, { API_BASE_REF: 'noreport' }).status).toBe(0);
  });
});
