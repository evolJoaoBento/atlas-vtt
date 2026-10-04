import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { API_VERSION } from '../../src/api/version';

const report = readFileSync('api-report/atlas-vtt-api.d.ts', 'utf8');

describe('API report', () => {
  it('imports nothing of Atlas internals or libraries but obsidian', () => {
    const sources = [...report.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    expect(new Set(sources)).toEqual(new Set(['obsidian']));
  });

  it('carries the API version as a literal', () => {
    expect(report).toContain(`export declare const API_VERSION = "${API_VERSION}";`);
  });
});
