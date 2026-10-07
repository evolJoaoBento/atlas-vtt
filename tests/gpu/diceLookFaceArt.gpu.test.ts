import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import { CELL } from '../../src/app/dice3d/atlasCell';
import { DEFAULT_DICE_LOOK } from '../../src/app/dice3d/diceLook';
import type { DieBody } from '../../src/app/dice3d/dieBody';
import { loadNumerals } from '../../src/app/dice3d/dieNumerals';
import { resolveLook, type ResolvedLook } from '../../src/app/dice3d/dieSkin';
import { paintFaceMarks } from '../../src/app/dice3d/faceArt';

/** Art with an opaque magenta ring and a transparent middle: whatever is painted under it shows through the middle. */
function ringArt(): HTMLCanvasElement {
  const art = document.createElement('canvas');
  art.width = 64;
  art.height = 64;
  const ctx = art.getContext('2d')!;
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.clearRect(12, 12, 40, 40);
  return art;
}

/** One face cell painted white and then with the face's marks; how many of its pixels are dark (an Atlas numeral) and magenta (the art). */
function paintCell(body: DieBody, value: number, look: ResolvedLook): { dark: number; magenta: number } {
  const canvas = document.createElement('canvas');
  canvas.width = CELL;
  canvas.height = CELL;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CELL, CELL);
  paintFaceMarks(ctx, CELL / 2, CELL / 2, body, value, look);
  const pixels = ctx.getImageData(0, 0, CELL, CELL).data;
  let dark = 0;
  let magenta = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
    if (r < 120 && g < 120 && b < 120) dark++;
    if (r > 200 && g < 80 && b > 200) magenta++;
  }
  return { dark, magenta };
}

function withArt(body: DieBody, keys: number[]): ResolvedLook {
  const art = ringArt();
  const base = resolveLook({ ...DEFAULT_DICE_LOOK, font: 'scifi' }, null);
  return { ...base, lookId: 'ext:ring', art: { faces: new Map([[body, new Map(keys.map((key) => [key, art]))]]), bump: new Map() } };
}

describe("a dice look's face art on real canvases", () => {
  it('a face with art shows the art and no numeral of Atlas, over or under it; a face without art keeps the numeral', async () => {
    await loadNumerals('scifi');
    const plain = resolveLook({ ...DEFAULT_DICE_LOOK, font: 'scifi' }, null);
    expect(paintCell(20, 20, plain).dark).toBeGreaterThan(50);
    const art = paintCell(20, 20, withArt(20, [20]));
    expect(art.magenta).toBeGreaterThan(200);
    expect(art.dark).toBe(0);
    // Another face of the same body without art still has Atlas's numeral.
    expect(paintCell(20, 7, withArt(20, [20])).dark).toBeGreaterThan(50);
  });

  it("the d10's 10 and the d100 tens die's 00 take the art keyed 10 and 0", async () => {
    await loadNumerals('scifi');
    expect(paintCell(10, 10, withArt(10, [10])).dark).toBe(0);
    expect(paintCell(100, 10, withArt(100, [0])).dark).toBe(0);
    expect(paintCell(100, 10, withArt(100, [100])).dark).toBeGreaterThan(50);
  });
});
