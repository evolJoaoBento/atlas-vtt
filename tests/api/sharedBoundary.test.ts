import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENTRIES = ['grid', 'draw', 'rules', 'dice3d', 'diceDisplay'] as const;
/** The only packages an entry may import: dice3d renders with three; the rest, diceDisplay included, import relative modules only. */
const ALLOWED_PACKAGES: Record<(typeof ENTRIES)[number], readonly string[]> = { grid: [], draw: [], rules: [], dice3d: ['three'], diceDisplay: [] };
const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXTENSIONS = ['.ts', '.tsx', '/index.ts'];

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function resolveLocal(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  if (/\.(webp|png|svg)(\?.*)?$/.test(spec)) return null;
  for (const candidate of [base, ...EXTENSIONS.map((ext) => base + ext)]) if (isFile(candidate)) return candidate;
  throw new Error(`Cannot resolve ${spec} from ${from}`);
}

/** Every module an entry reaches, and the packages they import. */
function reach(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [resolve(`src/shared/${entry}.ts`)];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const spec = match[1] ?? match[2]!;
      if (spec.startsWith('.')) {
        const next = resolveLocal(file, spec);
        if (next) queue.push(next);
      } else {
        packages.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);
      }
    }
  }
  return { files, packages };
}

describe('shared modules package', () => {
  for (const entry of ENTRIES) {
    it(`${entry} imports only relative modules and its allowed packages`, () => {
      const { packages } = reach(entry);
      expect([...packages].filter((name) => !ALLOWED_PACKAGES[entry].includes(name))).toEqual([]);
    });
  }

  it('only dice3d reads the activeDocument and createEl globals', () => {
    for (const entry of ENTRIES.filter((name) => name !== 'dice3d')) {
      for (const file of reach(entry).files) {
        expect(readFileSync(file, 'utf8'), file).not.toMatch(/\b(activeDocument|createEl|activeWindow)\b/);
      }
    }
  });

  it('keeps the module closure small, so the package .d.ts stays small', () => {
    const all = new Set<string>();
    for (const entry of ENTRIES) for (const file of reach(entry).files) all.add(file);
    expect(all.size).toBeLessThan(120);
  });
});
