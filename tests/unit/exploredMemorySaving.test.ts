import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { Renderer } from 'pixi.js';
import { ExploredMemory } from '../../src/app/pixi/lighting/ExploredMemory';
import type { ViewAtlasStore } from '../../src/app/storeFactory';

const saved = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../src/app/pixi/lighting/ExploredTexture', () => ({
  ExploredTexture: class {
    readonly texture = {};
    add(): void {}
    clear(): void {}
    destroy(): void {}
    toCanvas(): object { return {}; }
  },
}));
vi.mock('../../src/app/pixi/lighting/ExploredSteps', () => ({
  ExploredSteps: class {
    full = false;
    size = 0;
    apply(): boolean { return true; }
    leads(): boolean { return true; }
    travel(): void {}
    clear(): void {}
    sightRecorded(): void {}
  },
}));
vi.mock('../../src/app/pixi/lighting/exploredMaskSaving', () => ({ saveExploredMask: () => `data:mask-${++saved.count}` }));
vi.mock('../../src/app/stores/exploredEditHistory', () => ({ forgetExploredEdits: () => {} }));

const BOUNDS = { x: 0, y: 0, width: 1000, height: 800 };

interface FakeState {
  mapPath: string;
  isMapLoading: boolean;
  exploredEdits: number;
  exploredMask: string | null;
  setExploredEdits(count: number): void;
  setExploredMask(mask: string | null): void;
}

function setup() {
  const store = createStore<FakeState>((set) => ({
    mapPath: 'maps/cave.md',
    isMapLoading: false,
    exploredEdits: 0,
    exploredMask: null,
    setExploredEdits: (exploredEdits) => set({ exploredEdits }),
    setExploredMask: (exploredMask) => set({ exploredMask }),
  }));
  const memory = new ExploredMemory({
    renderer: {} as Renderer, store: store as unknown as ViewAtlasStore,
    onTexture: () => {}, onTravel: () => {}, onChange: () => {}, guard: (work) => work(),
  });
  memory.sync(BOUNDS, null);
  return { store, memory };
}

beforeEach(() => { vi.useFakeTimers(); saved.count = 0; });
afterEach(() => { vi.useRealTimers(); });

describe('when the explored memory reaches the scene, which is what online players are shown', () => {
  it('saves a forget at once, with no wait for the debounce', () => {
    const { store, memory } = setup();
    expect(memory.edit({ mode: 'forget', area: 'everything' })).toBe(true);
    expect(store.getState().exploredMask).toBe('data:mask-1');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still waits to save what is revealed', () => {
    const { store, memory } = setup();
    expect(memory.edit({ mode: 'reveal', area: 'everything' })).toBe(true);
    expect(store.getState().exploredMask).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(store.getState().exploredMask).toBe('data:mask-1');
  });

  it('saves at once when undo or redo moves the edits, which may take memory away', () => {
    const { store, memory } = setup();
    memory.edit({ mode: 'reveal', area: 'everything' });
    vi.advanceTimersByTime(2000);
    expect(store.getState().exploredMask).toBe('data:mask-1');
    // Undo of the reveal: the store's count goes back.
    store.getState().setExploredEdits(0);
    expect(store.getState().exploredMask).toBe('data:mask-2');
    expect(vi.getTimerCount()).toBe(0);
  });
});
