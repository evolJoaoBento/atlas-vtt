import { describe, expect, it } from 'vitest';
import { darknessOf } from '../../../src/app/online/scene/darknessFog';
import { darknessCellSize, type DarknessRaster } from '../../../src/app/online/scene/darknessRaster';
import type { LightingFrame } from '../../../src/app/online/scene/LiveLighting';
import { drawingBounds, textBounds } from '../../../src/app/online/scene/objectBounds';
import type { MapSize } from '../../../src/app/online/scene/sceneTypes';
import type { DrawingStroke, TextElement } from '../../../src/app/types';
import { project, scene } from './lightingFixtures';

function raster(map: MapSize, dark: (col: number, row: number) => boolean): DarknessRaster {
  const cellSize = darknessCellSize(map);
  const cols = Math.ceil(map.width / cellSize);
  const rows = Math.ceil(map.height / cellSize);
  const cells = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) cells[row * cols + col] = dark(col, row) ? 1 : 0;
  return { cols, rows, cellSize, map, dark: cells };
}

const frameOf = (grid: DarknessRaster): LightingFrame => ({ seen: () => false, darkness: darknessOf(grid) });

function box(id: string, x: number, y: number, width: number, height: number): TextElement {
  return { id, kind: 'text', x, y, text: 'a', fontSize: 1, fontFamily: 'serif', color: '#000000', width, height } as TextElement;
}

function stroke(id: string, points: Array<{ x: number; y: number }>, width: number): DrawingStroke {
  return { id, kind: 'drawing', timestamp: 1, type: 'pen', points, color: '#ff0000', width, opacity: 1 };
}

describe('texts and drawings are sent only where the darkness is proven shown', () => {
  it('sends nothing on an all-dark map whose size is not a multiple of the fog cells', () => {
    const map = { width: 1003, height: 797 };
    const frame = frameOf(raster(map, () => true));
    const state = scene({ ambient: 1 }, {
      texts: {
        corner: box('corner', 1000, 795, 6, 6), right: box('right', 1000, 300, 6, 6), bottom: box('bottom', 300, 795, 6, 6),
        strip: box('strip', 1000, 300, 2, 2), middle: box('middle', 400, 400, 20, 20),
      },
      drawings: { right: stroke('right', [{ x: 1001, y: 100 }, { x: 1002, y: 120 }], 1), bottom: stroke('bottom', [{ x: 100, y: 796 }, { x: 120, y: 796 }], 1) },
    });
    const projected = project(state, frame, map);
    expect(projected.texts).toEqual({});
    expect(projected.drawings).toEqual({});
  });

  it('sends an item in a shown part of such a map, up to its edge', () => {
    const map = { width: 1003, height: 797 };
    const state = scene({ ambient: 1 }, { texts: { edge: box('edge', 1000, 795, 6, 6) }, drawings: { edge: stroke('edge', [{ x: 1000, y: 700 }, { x: 1001, y: 790 }], 1) } });
    const projected = project(state, frameOf(raster(map, () => false)), map);
    expect(Object.keys(projected.texts)).toEqual(['edge']);
    expect(Object.keys(projected.drawings)).toEqual(['edge']);
  });

  it('never sends an item with a pixel the darkness shades, over random maps and items (reference per pixel)', () => {
    let seed = 12345;
    const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    const between = (low: number, high: number): number => low + random() * (high - low);
    for (let round = 0; round < 120; round++) {
      const map = { width: Math.floor(between(60, 1200)) | 1, height: Math.floor(between(60, 900)) | 1 };
      const blocks = Array.from({ length: 24 }, () => random() < 0.5);
      const grid = raster(map, (col, row) => blocks[((col >> 1) * 5 + (row >> 1) * 3) % 24]!);
      const texts: Record<string, TextElement> = {};
      const drawings: Record<string, DrawingStroke> = {};
      for (let i = 0; i < 25; i++) {
        const nearEdge = (extent: number): number => (random() < 0.5 ? extent + between(-30, 30) : between(-20, extent + 20));
        texts[`t${i}`] = box(`t${i}`, nearEdge(map.width), nearEdge(map.height), between(0.5, 40), between(0.5, 40));
        const x = nearEdge(map.width);
        const y = nearEdge(map.height);
        drawings[`d${i}`] = stroke(`d${i}`, [{ x, y }, { x: x + between(-30, 30), y: y + between(-30, 30) }], between(0.5, 4));
      }
      const projected = project(scene({ ambient: 1 }, { texts, drawings }), frameOf(grid), map);
      const allShown = (b: { x: number; y: number; width: number; height: number }): boolean => {
        const x0 = Math.floor(Math.max(b.x, 0));
        const x1 = Math.ceil(Math.min(b.x + b.width, map.width));
        const y0 = Math.floor(Math.max(b.y, 0));
        const y1 = Math.ceil(Math.min(b.y + b.height, map.height));
        if (x1 <= x0 || y1 <= y0) return false;
        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            if (grid.dark[Math.floor(py / grid.cellSize) * grid.cols + Math.floor(px / grid.cellSize)] !== 0) return false;
          }
        }
        return true;
      };
      for (const id of Object.keys(projected.texts)) expect(allShown(textBounds(texts[id]!)), `text ${id}, round ${round}`).toBe(true);
      for (const id of Object.keys(projected.drawings)) {
        // What players are sent: the points rounded, the width kept in range.
        expect(allShown(drawingBounds(projected.drawings[id]!)), `drawing ${id}, round ${round}`).toBe(true);
      }
    }
  });
});

describe('the text box is checked as players draw it', () => {
  const map = { width: 1000, height: 800 };
  const words = (id: string, x: number, content: string, extra: Partial<TextElement>): TextElement => (
    { id, kind: 'text', x, y: 400, text: content, fontSize: 16, fontFamily: 'serif', color: '#000000', ...extra } as TextElement
  );
  const sentWith = (frameDarkFrom: number, texts: Record<string, TextElement>): string[] => {
    const grid = raster(map, (col) => col * grid8 >= frameDarkFrom);
    return Object.keys(project(scene({ ambient: 1 }, { texts }), frameOf(grid), map).texts);
  };
  const grid8 = darknessCellSize(map);

  it('uses the clamped font size and scale, not the raw ones (a font size of 0.01, a scale of 0.0001)', () => {
    const twenty = 'WWWWWWWWWWWWWWWWWWWW';
    expect(sentWith(16, { tiny: words('tiny', 12, twenty, { fontSize: 0.01 }) })).toEqual([]);
    expect(sentWith(16, { squashed: words('squashed', 12, twenty, { fontSize: 1000, scale: 0.0001 }) })).toEqual([]);
    // The same texts well clear of the dark are still sent.
    expect(sentWith(900, { tiny: words('tiny', 12, twenty, { fontSize: 0.01 }) })).toEqual(['tiny']);
  });

  it('counts code points and gives wide ones two ems: ten CJK characters reach twice as far', () => {
    const wide = '漢字漢字漢字漢字漢字';
    // At 16 px each, ten characters are drawn up to 320 px wide: 100 +- 160 reaches the dark that starts at 224.
    expect(sentWith(224, { cjk: words('cjk', 100, wide, {}) })).toEqual([]);
    expect(sentWith(224, { latin: words('latin', 100, 'abcdefghij', {}) })).toEqual(['latin']);
    // Astral characters are one code point each, not two units.
    expect(sentWith(224, { emoji: words('emoji', 100, '😀😀😀😀😀', {}) })).toEqual(['emoji']);
  });
});
