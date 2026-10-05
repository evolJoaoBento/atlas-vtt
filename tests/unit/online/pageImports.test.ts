// @vitest-environment node
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { PAGE_TEXTS } from '../../../online-client/shims/i18n.mts';
import { en } from '../../../src/app/i18n/locales/en';

const I18N = 'src/app/i18n/index.ts';
/** The shared Atlas modules whose labels go through `t()`; the page build gives them `online-client/shims/i18n.mts`. */
const TRANSLATED = ['src/app/pixi/mapIcons.ts', 'src/app/pixi/token-renderer/tokenSizing.ts', 'src/app/tools/laserPointerSettings.ts'];

/** Who imports what in the join page, the 3D dice chunk included, before the page build swaps the translations. */
async function pageImports(): Promise<Array<{ from: string; to: string }>> {
  const result = await build({
    entryPoints: ['online-client/main.mts'], bundle: true, write: false, metafile: true, platform: 'browser', format: 'esm', outdir: 'unused',
    external: ['obsidian'], logLevel: 'silent',
    loader: { '.webp': 'empty', '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.css': 'empty', '.wav': 'empty', '.mp3': 'empty', '.glsl': 'text' },
  });
  return Object.entries(result.metafile.inputs).flatMap(([from, info]) => info.imports.map((entry) => ({ from, to: entry.path })));
}

describe('what the join page imports', () => {
  it('reaches obsidian only through the translations, and the translations only from the modules the page build gives English texts', async () => {
    const imports = await pageImports();
    expect(imports.filter((entry) => entry.to === 'obsidian').map((entry) => entry.from)).toEqual([I18N]);
    expect(imports.filter((entry) => entry.to === I18N).map((entry) => entry.from).sort()).toEqual(TRANSLATED);
  }, 60_000);

  it('has every text those modules name, as Atlas writes it in English', () => {
    const keys = TRANSLATED.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/\bt\('([\w.]+)'/g)].map((match) => match[1]!));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(PAGE_TEXTS[key], key).toEqual(en[key as keyof typeof en]);
  });
});
