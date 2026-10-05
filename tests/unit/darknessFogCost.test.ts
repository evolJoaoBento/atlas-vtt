/**
 * A remote view's fog holds a lit scene's darkness as one operation after every fog operation the
 * GM painted, and the darkness changes on its own. Each change must draw again only the darkness,
 * never every GM operation: the fog renderer keeps each operation's canvas whose records did not
 * change, and the remote view's compositor keeps everything before the latest operation once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createStore } from 'zustand/vanilla';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const rendered = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../src/app/pixi/fog/fogRenderUtils', async (actual) => {
  const module = await actual<typeof import('../../src/app/pixi/fog/fogRenderUtils')>();
  return { ...module, renderOperation: (...args: Parameters<typeof module.renderOperation>) => { rendered.count++; module.renderOperation(...args); } };
});
// Imported after the mock, so the renderer draws through the counting `renderOperation`.
const { FogOfWarRenderer } = await import('../../src/app/pixi/fog/FogOfWarRenderer');

/** The darkness's id and order as an extension feeds it: after every GM operation. */
const DARKNESS_ID = 'darkness';
const DARKNESS_ORDER = Number.MAX_SAFE_INTEGER;

/** `count` GM brush strokes and as many erases, a heavily fogged scene. */
function heavyFog(count: number): Record<string, FogOperation> {
  const fog: Record<string, FogOperation> = {};
  for (let i = 0; i < count; i++) {
    fog[`p${i}`] = { id: `p${i}`, kind: 'fog', type: 'brush', timestamp: 10 + 2 * i, isErasing: false, brushRadius: 20, points: [{ x: 10 * i, y: 50 }, { x: 10 * i + 40, y: 90 }] };
    fog[`e${i}`] = { id: `e${i}`, kind: 'fog', type: 'rectangle', timestamp: 11 + 2 * i, isErasing: true, x: 10 * i, y: 60, width: 5, height: 5 };
  }
  return fog;
}

/** A lit scene's darkness: one paint lasso after every GM operation. */
function darknessOp(x: number): FogOperation {
  return {
    id: DARKNESS_ID, kind: 'fog', type: 'lasso', timestamp: DARKNESS_ORDER, isErasing: false,
    points: [{ x: 0, y: 0 }, { x, y: 0 }, { x, y: 800 }, { x: 0, y: 800 }],
  };
}

afterEach(() => { vi.restoreAllMocks(); });

/** The draws of each of three darkness changes in a view whose store has `remoteView` as given. */
function drawsPerChange(remoteView: object | null): number[] {
  const restore = stubJsdomGraphics();
  const gmFog = heavyFog(200);
  const store = createStore(() => ({
    isPlayerView: true, isGMView: false, isMapLoading: false, activeTool: 'select', mapPath: 'remote:view-1', remoteView,
    objects: { fog: { ...gmFog, [DARKNESS_ID]: darknessOp(300) } },
  }));
  const renderer = new FogOfWarRenderer(new Container() as never, { canvas: createEl('canvas') } as never, new EventEmitter(), store as never);
  try {
    const perChange: number[] = [];
    for (const x of [400, 500, 600]) {
      rendered.count = 0;
      store.setState({ objects: { fog: { ...gmFog, [DARKNESS_ID]: darknessOp(x) } } });
      perChange.push(rendered.count);
    }
    return perChange;
  } finally {
    renderer.destroy();
    restore();
  }
}

describe('a darkness change in a remote view costs the same however much fog the GM painted', () => {
  it('draws only the darkness again, not every GM operation', () => {
    // The darkness's own canvas and the composite's latest operation, at most: never the 400 GM operations.
    expect(Math.max(...drawsPerChange({}))).toBeLessThanOrEqual(2);
  });

  it('a view that is not remote composites every operation again, as upstream does', () => {
    expect(Math.min(...drawsPerChange(null))).toBeGreaterThan(400);
  });
});
