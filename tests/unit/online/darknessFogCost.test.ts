import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createStore } from 'zustand/vanilla';
import { DARKNESS_FOG_ID, DARKNESS_ORDER, type Darkness } from '../../../src/app/online/scene/darknessFog';
import { FogCoverage } from '../../../src/app/online/scene/FogCoverage';
import { createProjectionMemo, projectFog } from '../../../src/app/online/scene/projectRecords';
import { FogCoverageCache } from '../../../src/app/online/scene/sceneSources';
import type { FogOperation } from '../../../src/app/types/fogTypes';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

const rendered = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../../src/app/pixi/fog/fogRenderUtils', async (actual) => {
  const module = await actual<typeof import('../../../src/app/pixi/fog/fogRenderUtils')>();
  return { ...module, renderOperation: (...args: Parameters<typeof module.renderOperation>) => { rendered.count++; module.renderOperation(...args); } };
});
// Imported after the mock, so the renderer draws through the counting `renderOperation`.
const { FogOfWarRenderer } = await import('../../../src/app/pixi/fog/FogOfWarRenderer');

/** `count` GM brush strokes and as many erases, a heavily fogged scene. */
function heavyFog(count: number): Record<string, FogOperation> {
  const fog: Record<string, FogOperation> = {};
  for (let i = 0; i < count; i++) {
    fog[`p${i}`] = { id: `p${i}`, kind: 'fog', type: 'brush', timestamp: 10 + 2 * i, isErasing: false, brushRadius: 20, points: [{ x: 10 * i, y: 50 }, { x: 10 * i + 40, y: 90 }] };
    fog[`e${i}`] = { id: `e${i}`, kind: 'fog', type: 'rectangle', timestamp: 11 + 2 * i, isErasing: true, x: 10 * i, y: 60, width: 5, height: 5 };
  }
  return fog;
}

/** A lit scene's darkness as the Obsidian client gets it: one paint lasso after every GM operation. */
function darknessOp(x: number): FogOperation {
  return {
    id: DARKNESS_FOG_ID, kind: 'fog', type: 'lasso', timestamp: DARKNESS_ORDER, isErasing: false,
    points: [{ x: 0, y: 0 }, { x, y: 0 }, { x, y: 800 }, { x: 0, y: 800 }],
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('a darkness change costs the same however much fog the GM painted', () => {
  it('on the GM: the fog is rasterised once, then each darkness is painted over its cells', () => {
    const fog = heavyFog(300);
    const replays = vi.spyOn(FogCoverage, 'fromPlayerFog');
    const cache = new FogCoverageCache();
    const memo = createProjectionMemo();
    const darkness = (x: number): Darkness => ({ fog: {}, covered: [{ x, y: 0, width: 100, height: 800 }] });
    for (const x of [500, 600, 700]) cache.get(fog, memo, darkness(x));
    expect(replays).toHaveBeenCalledTimes(1);
    // The darkness painted over the cells covers what painting it after the operations covers.
    const covered = cache.get(fog, memo, darkness(700)).darkCoverage;
    const replayed = FogCoverage.fromPlayerFog(projectFog(fog, memo), darkness(700).covered);
    for (let x = 0; x < 3200; x += 8) {
      for (let y = 0; y < 800; y += 8) {
        const cell = { x, y, width: 8, height: 8 };
        if (covered.isCovered(cell) !== replayed.isCovered(cell)) throw new Error(`differs at ${x},${y}`);
      }
    }
  });

  it('on the Obsidian online scene: only the darkness is drawn again, not every GM operation', () => {
    const restore = stubJsdomGraphics();
    const gmFog = heavyFog(200);
    const store = createStore(() => ({
      isPlayerView: true, isGMView: false, isMapLoading: false, activeTool: 'select', mapPath: 'remote', remoteScene: {},
      objects: { fog: { ...gmFog, [DARKNESS_FOG_ID]: darknessOp(300) } },
    }));
    const renderer = new FogOfWarRenderer(new Container() as never, { canvas: createEl('canvas') } as never, new EventEmitter(), store as never);
    try {
      const perChange: number[] = [];
      for (const x of [400, 500, 600]) {
        rendered.count = 0;
        store.setState({ objects: { fog: { ...gmFog, [DARKNESS_FOG_ID]: darknessOp(x) } } });
        perChange.push(rendered.count);
      }
      // The darkness's own canvas and the composite's latest operation, at most: never the 400 GM operations.
      expect(Math.max(...perChange)).toBeLessThanOrEqual(2);
    } finally {
      renderer.destroy();
      restore();
    }
  });
});
