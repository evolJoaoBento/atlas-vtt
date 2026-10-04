import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisposerSet } from '../../src/api/disposers';
import { lightingApi } from '../../src/api/lighting';
import type { ExploredImage } from '../../src/app/lighting/playerDarkness/darknessRaster';
import { fixtureExploredImage, fixtureLighting, lightingFromStore, scene, wall, character } from '../unit/lightingFixtures';
import { fakeView, framesFor, loadMap as load, trackerWith, type FakeView } from './apiFakes';

const MAP = { width: 1000, height: 500 };

function setup(view: FakeView, decode?: Parameters<typeof framesFor>[0]): { api: ReturnType<typeof lightingApi>; disposers: DisposerSet } {
  const disposers = new DisposerSet();
  return { api: lightingApi(trackerWith([view]).tracker, framesFor(decode), disposers), disposers };
}

/** Daylight, a wall at x = 500: the hero sees the left half of the map only. */
const walled = (heroX = 140) => lightingFromStore(scene({ ambient: 1 }, {
  tokens: { hero: character('hero', heroX, 250, { vision: { enabled: true } }), goblin: character('goblin', 800, 250) },
  walls: { w: wall('w', { x: 500, y: -10 }, { x: 500, y: 510 }) },
}), MAP)!;

afterEach(() => { vi.useRealTimers(); });

describe('lighting', () => {
  it('C-light-1: unlit, pending (no renderer on a lit scene, sight not ready, loading, explored decoding) and ready', () => {
    const view = fakeView('v1');
    load(view);
    const { api } = setup(view);
    view.setPlayerLighting(null);
    expect(api.playerVisibility('v1')).toEqual({ status: 'unlit' });
    view.setPlayerLighting(undefined);
    expect(api.playerVisibility('v1')).toEqual({ status: 'unlit' });
    view.atlasStore.getState().setSceneLighting({ enabled: true });
    expect(api.playerVisibility('v1')).toEqual({ status: 'pending' });
    view.setPlayerLighting(fixtureLighting({ ready: false }));
    expect(api.playerVisibility('v1')).toEqual({ status: 'pending' });
    view.setPlayerLighting(fixtureLighting({ ready: true, perception: (id) => (id === 'seen-token' ? 'seen' : 'unseen') }));
    view.atlasStore.setState({ isMapLoading: true });
    expect(api.playerVisibility('v1').status).toBe('pending');
    load(view);
    const ready = api.playerVisibility('v1');
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') return;
    expect(Object.keys(ready).sort()).toEqual(['darkness', 'showsExplored', 'status', 'tokens']);
    expect(Object.keys(ready.darkness).sort()).toEqual(['cellSize', 'cols', 'rows', 'shown']);
    expect(ready.darkness.shown).toBeInstanceOf(Uint8Array);
    expect(ready.darkness.shown.length).toBe(ready.darkness.cols * ready.darkness.rows);
  });

  it('C-light-1: a graphics context lost after sight was ready reads as pending again', () => {
    const view = fakeView('v1');
    load(view);
    const { api } = setup(view);
    view.setPlayerLighting(fixtureLighting({ ready: true }));
    expect(api.playerVisibility('v1').status).toBe('ready');
    view.setPlayerLighting(fixtureLighting({ ready: false })); // what A19's sightReady() reports after context loss
    expect(api.playerVisibility('v1')).toEqual({ status: 'pending' });
  });

  it('C-light-1: a view whose map has no size yet is pending', () => {
    const view = fakeView('v1');
    load(view);
    const { api } = setup(view);
    view.setPlayerLighting(fixtureLighting({ ready: true }));
    const renderer = view.renderer!;
    renderer.getBackgroundSprite = () => null;
    expect(api.playerVisibility('v1')).toEqual({ status: 'pending' });
  });

  it('C-light-1: explored memory still decoding reads as pending until the decode resolves', async () => {
    let resolveDecode!: (image: ExploredImage) => void;
    const decode = (): Promise<ExploredImage> => new Promise((resolve) => { resolveDecode = resolve; });
    const view = fakeView('v1');
    load(view);
    view.atlasStore.setState({ exploredMask: 'data:image/png;base64,AAAA' });
    view.setPlayerLighting(fixtureLighting({ ready: true, showsExplored: true }));
    const { api } = setup(view, decode);
    expect(api.playerVisibility('v1')).toEqual({ status: 'pending' });
    resolveDecode(fixtureExploredImage());
    await Promise.resolve();
    expect(api.playerVisibility('v1').status).toBe('ready');
  });

  it('C-light-1: tokens follow the window\'s perception, and the darkness shows what it shows', () => {
    const view = fakeView('v1');
    load(view);
    view.atlasStore.setState({ objects: { ...view.atlasStore.getState().objects, tokens: { hero: character('hero', 140, 250), goblin: character('goblin', 800, 250) } } });
    view.setPlayerLighting(walled());
    const { api } = setup(view);
    const ready = api.playerVisibility('v1');
    if (ready.status !== 'ready') throw new Error(`not ready: ${ready.status}`);
    expect(ready.tokens).toEqual({ hero: 'seen', goblin: 'unseen' });
    const { cellSize, cols, shown } = ready.darkness;
    const shownAt = (x: number, y: number): number => shown[Math.floor(y / cellSize) * cols + Math.floor(x / cellSize)]!;
    expect(shownAt(300, 250)).toBe(1);
    expect(shownAt(800, 250)).toBe(0);
    expect(JSON.stringify(ready)).not.toMatch(/wall|light|polygon|sight|regions|reaches|"p1"/i);
  });

  it('C-light-1: hands out frozen answers whose darkness no caller can change for another', () => {
    const view = fakeView('v1');
    load(view);
    view.setPlayerLighting(walled());
    const { api } = setup(view);
    const first = api.playerVisibility('v1');
    if (first.status !== 'ready') throw new Error('not ready');
    expect(Object.isFrozen(first) && Object.isFrozen(first.tokens) && Object.isFrozen(first.darkness)).toBe(true);
    first.darkness.shown.fill(1);
    const second = api.playerVisibility('v1');
    if (second.status !== 'ready') throw new Error('not ready');
    expect(second.darkness.shown).not.toBe(first.darkness.shown);
    expect(second.darkness.shown.includes(0)).toBe(true);
  });

  it('C-light-1: maxCellsPerSide is clamped to 16–1024 and defaults to 384', () => {
    const view = fakeView('v1');
    load(view);
    view.setPlayerLighting(fixtureLighting({ ready: true }));
    const { api } = setup(view);
    const cells = (maxCellsPerSide?: number): number => {
      const result = api.playerVisibility('v1', maxCellsPerSide === undefined ? undefined : { maxCellsPerSide });
      return result.status === 'ready' ? result.darkness.cols : -1;
    };
    expect(cells()).toBe(125);
    expect(cells(1)).toBe(16);
    expect(cells(Number.NaN)).toBe(125);
    expect(cells(100_000)).toBe(125);
  });

  it('C-light-1: nothing worked out for one map stands in for the next one the view loads', async () => {
    vi.useFakeTimers();
    const decode = vi.fn((): Promise<ExploredImage> => Promise.resolve(fixtureExploredImage()));
    const view = fakeView('v1');
    load(view);
    view.atlasStore.setState({ exploredMask: 'data:a' });
    view.setPlayerLighting(walled());
    const { api } = setup(view, decode);
    api.playerVisibility('v1');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.playerVisibility('v1').status).toBe('ready');
    // Another tab's map loads in the same view, within the darkness interval.
    view.atlasStore.setState({ isMapLoading: true, mapPath: 'maps/b.atlasmap' });
    view.atlasStore.setState({ isMapLoading: false, exploredMask: 'data:b' });
    view.setPlayerLighting(walled(800));
    expect(api.playerVisibility('v1')).toEqual({ status: 'pending' });
    await vi.advanceTimersByTimeAsync(0);
    const next = api.playerVisibility('v1');
    if (next.status !== 'ready') throw new Error('not ready');
    const { cellSize, cols, shown } = next.darkness;
    // The hero now stands right of the wall: the left half, shown on the last map, is dark at once.
    expect(shown[Math.floor(250 / cellSize) * cols + Math.floor(100 / cellSize)]).toBe(0);
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('C-light-2: watch fires when sight is recomputed, and its disposer stops it', () => {
    const view = fakeView('v1');
    const { api } = setup(view);
    const listener = vi.fn();
    const stop = api.watch('v1', listener);
    view.firePlayerLightingChange();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    view.firePlayerLightingChange();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('C-light-2: watch fires when the scene\'s lighting or explored memory changes, runs guarded and ends with the view', () => {
    const view = fakeView('v1');
    const { api } = setup(view);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listener = vi.fn(() => { throw new Error('boom'); });
    api.watch('v1', listener);
    view.atlasStore.getState().setSceneLighting({ enabled: true });
    view.atlasStore.setState({ exploredMask: 'data:x' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalled();
    view.close();
    view.firePlayerLightingChange();
    expect(listener).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it('C-light-2: watch hears a renderer that was not there when it started', () => {
    const view = fakeView('v1');
    const renderer = view.renderer;
    (view as { renderer: FakeView['renderer'] }).renderer = null;
    const { api } = setup(view);
    const listener = vi.fn();
    api.watch('v1', listener);
    (view as { renderer: FakeView['renderer'] }).renderer = renderer;
    load(view);
    listener.mockClear();
    view.firePlayerLightingChange();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('C-light-3: an unknown view is pending, never unlit', () => {
    expect(lightingApi(trackerWith([]).tracker, framesFor(), new DisposerSet()).playerVisibility('nope')).toEqual({ status: 'pending' });
    expect(() => lightingApi(trackerWith([]).tracker, framesFor(), new DisposerSet()).watch('nope', () => undefined)()).not.toThrow();
  });
});
