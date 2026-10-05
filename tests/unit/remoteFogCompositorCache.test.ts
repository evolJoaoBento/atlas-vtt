import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createStore } from 'zustand/vanilla';
import { FogCanvasCompositor } from '../../src/app/pixi/fog/FogCanvasCompositor';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import type { FogBounds, FogOperation } from '../../src/app/types/fogTypes';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const bounds: FogBounds = { x: 0, y: 0, width: 200, height: 100 };

const op = (id: string, timestamp: number): FogOperation => ({
  id, kind: 'fog', type: 'rectangle', timestamp, isErasing: false, x: 0, y: 0, width: 10, height: 10,
});

/** Records what each canvas was painted with, as the names of the operations in drawing order. */
function recordPaints(): { restore: () => void; paintsOf: (canvas: HTMLCanvasElement) => string[] } {
  const restoreGraphics = stubJsdomGraphics();
  const log = new WeakMap<object, string[]>();
  const paintsOf = (canvas: HTMLCanvasElement): string[] => {
    const entries = log.get(canvas) ?? [];
    log.set(canvas, entries);
    return entries;
  };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return {
      canvas: this,
      clearRect: () => { paintsOf(this).length = 0; },
      drawImage: (source: HTMLCanvasElement) => { paintsOf(this).push(...paintsOf(source)); },
      fillRect: () => paintsOf(this).push('fill'),
      save: () => undefined, restore: () => undefined, beginPath: () => undefined, fill: () => undefined, rect: () => undefined,
    } as unknown as CanvasRenderingContext2D;
  } as HTMLCanvasElement['getContext']);
  return { restore: () => { getContext.mockRestore(); restoreGraphics(); }, paintsOf };
}

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; vi.restoreAllMocks(); });

describe('FogCanvasCompositor output', () => {
  it('composites the same operations in the same order with and without the prefix cache', async () => {
    const renderUtils = await import('../../src/app/pixi/fog/fogRenderUtils');
    const paints = recordPaints();
    cleanup = paints.restore;
    vi.spyOn(renderUtils, 'renderOperation').mockImplementation((ctx, operation) => {
      (ctx as unknown as { fillRect: () => void }).fillRect();
      paints.paintsOf(ctx.canvas).push(operation.id);
    });
    const plain = new FogCanvasCompositor(bounds, 0.5, false);
    const cached = new FogCanvasCompositor(bounds, 0.5, true);
    const base = [op('a', 1), op('b', 2), op('c', 3)];
    // Unsorted input, then the same records with a new latest operation (a darkness that changes on its own), then an undo.
    for (const ops of [[base[2]!, base[0]!, base[1]!], [...base, op('d', 4)], [...base, op('e', 4)], base.slice(0, 2)]) {
      plain.compositeAll(ops);
      cached.compositeAll(ops);
      expect(paints.paintsOf(cached.getCanvas())).toEqual(paints.paintsOf(plain.getCanvas()));
    }
    plain.destroy();
    cached.destroy();
  });
});

describe('which fog views keep a second, map-sized canvas', () => {
  function rendererFor(state: object): { compositeAll: () => number; destroy: () => void } {
    const store = createStore(() => ({ isPlayerView: false, isGMView: true, isMapLoading: false, activeTool: 'select', mapPath: 'map', objects: { fog: {} }, ...state }));
    const renderer = new FogOfWarRenderer(new Container() as never, { canvas: createEl('canvas') } as never, new EventEmitter(), store as never);
    const compositor = (renderer as unknown as { compositor: FogCanvasCompositor }).compositor;
    return {
      // Canvases allocated by compositing three operations twice, the second time with a new latest one.
      compositeAll: () => {
        const created = vi.spyOn(globalThis, 'createEl');
        compositor.compositeAll([op('a', 1), op('b', 2), op('c', 3)]);
        compositor.compositeAll([op('a', 1), op('b', 2), op('d', 4)]);
        const canvases = created.mock.calls.filter(([tag]) => tag === 'canvas').length;
        created.mockRestore();
        return canvases;
      },
      destroy: () => renderer.destroy(),
    };
  }

  it('a GM view allocates none, as upstream does', () => {
    cleanup = stubJsdomGraphics();
    const gm = rendererFor({});
    try { expect(gm.compositeAll()).toBe(0); } finally { gm.destroy(); }
  });

  it('the remote view keeps one for its fed darkness', () => {
    cleanup = stubJsdomGraphics();
    const remote = rendererFor({ isPlayerView: true, isGMView: false, remoteView: {} });
    try { expect(remote.compositeAll()).toBe(1); } finally { remote.destroy(); }
  });
});
