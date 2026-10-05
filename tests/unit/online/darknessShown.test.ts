import { describe, expect, it } from 'vitest';
import { DARKNESS_FOG_ID, darknessOf, shownByScan } from '../../../src/app/online/scene/darknessFog';
import { darknessCellSize, type DarknessRaster } from '../../../src/app/online/scene/darknessRaster';
import { drawingBounds, textBounds } from '../../../src/app/online/scene/objectBounds';
import type { MapSize } from '../../../src/app/online/scene/sceneTypes';
import type { DrawingStroke, TextElement } from '../../../src/app/types';
import { SCENE_LIMITS } from '../../../src/app/online/scene/sceneTypes';
import { darknessFor, closedFrame, lightingFrame, type LightingFrame } from '../../../src/app/online/scene/LiveLighting';
import { MAP, playerLightingOf, project, scene } from './lightingFixtures';

function raster(map: MapSize, dark: (col: number, row: number) => boolean): DarknessRaster {
  const cellSize = darknessCellSize(map);
  const cols = Math.ceil(map.width / cellSize);
  const rows = Math.ceil(map.height / cellSize);
  const cells = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) cells[row * cols + col] = dark(col, row) ? 1 : 0;
  return { cols, rows, cellSize, map, dark: cells };
}

const frameOf = (grid: DarknessRaster): LightingFrame => {
  const darkness = darknessOf(grid);
  return { seen: () => false, darkness, shown: (bounds) => darkness.shown(bounds) };
};

function box(id: string, x: number, y: number, width: number, height: number): TextElement {
  return { id, kind: 'text', x, y, text: 'a', fontSize: 1, fontFamily: 'serif', color: '#000000', width, height } as TextElement;
}

function stroke(id: string, points: Array<{ x: number; y: number }>, width: number): DrawingStroke {
  return { id, kind: 'drawing', timestamp: 1, type: 'pen', points, color: '#ff0000', width, opacity: 1 };
}

describe('texts and drawings are sent only where the darkness is shown, cell by cell', () => {
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
    let sent = 0;
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
      sent += Object.keys(projected.texts).length + Object.keys(projected.drawings).length;
      for (const id of Object.keys(projected.texts)) expect(allShown(textBounds(texts[id]!)), `text ${id}, round ${round}`).toBe(true);
      for (const id of Object.keys(projected.drawings)) {
        // What players are sent: the points rounded, the width kept in range.
        expect(allShown(drawingBounds(projected.drawings[id]!)), `drawing ${id}, round ${round}`).toBe(true);
      }
    }
    // The check is not an always-hide one.
    expect(sent).toBeGreaterThan(0);
  });

  it('checks a rotated, scaled text by its whole diagonal square', () => {
    const map = { width: 1000, height: 800 };
    const grid = raster(map, (col) => col * darknessCellSize(map) >= 960);
    const text = (id: string, extra: Partial<TextElement>): TextElement => (
      { id, kind: 'text', x: 860, y: 400, text: 'abcd', fontSize: 16, fontFamily: 'serif', color: '#000000', scale: 3, ...extra } as TextElement
    );
    const sentIds = (texts: Record<string, TextElement>): string[] => Object.keys(project(scene({ ambient: 1 }, { texts }), frameOf(grid), map).texts);
    // Unrotated it reaches 956; turned, its square reaches 960.6, into the dark cell that starts at 960. Scale 1 stays clear.
    expect(sentIds({ flat: text('flat', {}), turned: text('turned', { rotation: 45 }), small: text('small', { rotation: 45, scale: 1 }) }).sort()).toEqual(['flat', 'small']);
  });

  it('keeps a coarsened raster conservative: a coarse cell is dark when any cell in it is', () => {
    const map = { width: 1600, height: 1600 };
    // A chequerboard of dark cells in the top half makes a ring too long for one fog operation, so the raster is coarsened.
    const grid = raster(map, (col, row) => row < 100 && (col + row) % 2 === 1);
    const darkness = darknessOf(grid);
    const ring = darkness.fog[DARKNESS_FOG_ID];
    expect(ring?.type === 'lasso' ? ring.points.length : 0).toBeLessThanOrEqual(SCENE_LIMITS.points);
    const cell = darknessCellSize(map);
    // The lit cell (0, 0) shares a coarse cell with a dark one; the lit cells of the bottom half are shown.
    expect(darkness.shown({ x: 1, y: 1, width: cell - 2, height: cell - 2 })).toBe(false);
    expect(darkness.shown({ x: 10, y: 1000, width: 30, height: 30 })).toBe(true);
  });

  it('shows nothing while the lighting of the view cannot be read: a closed frame or sight that is not ready', () => {
    const state = scene({ ambient: 1 }, { texts: { a: box('a', 500, 400, 20, 20) }, drawings: { a: stroke('a', [{ x: 100, y: 100 }, { x: 120, y: 100 }], 2) } });
    expect(project(state, closedFrame(MAP)).texts).toEqual({});
    const lighting = playerLightingOf(state, MAP)!;
    const waiting = { ...lighting, ready: false };
    const frame = lightingFrame(waiting, darknessFor(waiting, null, MAP));
    const projected = project(state, frame);
    expect(projected.texts).toEqual({});
    expect(projected.drawings).toEqual({});
    // Ready, the same lit scene sends them.
    const ready = project(state, lightingFrame(lighting, darknessFor(lighting, null, MAP)));
    expect(Object.keys(ready.texts)).toEqual(['a']);
    expect(Object.keys(ready.drawings)).toEqual(['a']);
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

describe('the summed-area table answers as the scan of the cells does', () => {
  it('agrees over random rasters and bounds, inside, across, on and outside the map edge', () => {
    let seed = 99;
    const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    let shown = 0;
    let hidden = 0;
    for (let round = 0; round < 60; round++) {
      const map = { width: Math.floor(40 + random() * 600) | 1, height: Math.floor(40 + random() * 600) | 1 };
      const density = random() * 0.15;
      // One dark cell at least: a raster with none is `NO_DARKNESS`, which leaves bounds outside the map to its caller.
      const grid = raster(map, (col, row) => (col === 0 && row === 0) || random() < density);
      const darkness = darknessOf(grid);
      for (let i = 0; i < 200; i++) {
        const x = -40 + random() * (map.width + 80);
        const y = -40 + random() * (map.height + 80);
        const bounds = { x, y, width: random() < 0.1 ? 0 : random() * 120, height: random() < 0.1 ? 0 : random() * 120 };
        const expected = shownByScan(grid, bounds);
        expect(darkness.shown(bounds), `round ${round}`).toBe(expected);
        if (expected) shown++; else hidden++;
      }
    }
    // The comparison is not a trivial one.
    expect(shown).toBeGreaterThan(100);
    expect(hidden).toBeGreaterThan(100);
  });
});
