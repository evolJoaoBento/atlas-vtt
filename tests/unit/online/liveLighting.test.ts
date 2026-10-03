import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { ControlMessage } from '../../../src/app/online/protocol';
import { DARKNESS_FOG_ID } from '../../../src/app/online/scene/darknessFog';
import type { ExploredImage } from '../../../src/app/online/scene/darknessRaster';
import { DARKNESS_INTERVAL_MS, LiveLighting } from '../../../src/app/online/scene/LiveLighting';
import { SCENE_TICK_MS, SceneBroadcaster } from '../../../src/app/online/scene/SceneBroadcaster';
import type { PlayerScene } from '../../../src/app/online/scene/sceneTypes';
import type { PlayerLighting } from '../../../src/app/pixi/lighting/playerLightingLayers';
import { PresentedScene, type PresentedSceneInfo, type PresentedView } from '../../../src/app/services/PresentedScene';
import type { ViewAtlasState } from '../../../src/app/storeFactory';
import { createTabMetaStore } from '../../../src/app/stores/tabMetaStore';
import { character, exploredImage, light, MAP, playerLightingOf, scene, wall, type Scene } from './lightingFixtures';
import { fakeAssetIds, insideByNonzero } from './sceneFixtures';

/** The presented view's lighting, as a test sets it: `lighting` is what `getPlayerLighting` answers. */
function lightingSource(initial: PlayerLighting | undefined): { current: PlayerLighting | undefined; changed(): void; info: Pick<PresentedSceneInfo, 'lighting' | 'watchLighting'> } {
  const listeners = new Set<() => void>();
  const source = {
    current: initial,
    changed: () => listeners.forEach((listener) => listener()),
    info: {
      lighting: () => source.current,
      watchLighting: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    },
  };
  return source;
}

const walled = (heroX = 140): Scene => scene({ ambient: 1 }, {
  tokens: { hero: character('hero', heroX, 400, { vision: { enabled: true } }), goblin: character('goblin', 800, 400) },
  walls: { w: wall('w', { x: 503, y: -10 }, { x: 503, y: 810 }) },
});

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('live lighting of a presentation', () => {
  it('is nothing while the scene is unlit or dynamic lighting is off', () => {
    const source = lightingSource(undefined);
    const live = new LiveLighting(source.info as PresentedSceneInfo, () => {});
    expect(live.frame({ exploredMask: null }, MAP)).toBeNull();
  });

  it('follows tokens at once and works the darkness out at most every interval, calling back when it is due', () => {
    const source = lightingSource(playerLightingOf(walled(), MAP));
    const due = vi.fn();
    const live = new LiveLighting(source.info as PresentedSceneInfo, due);
    const first = live.frame({ exploredMask: null }, MAP, 0)!;
    source.current = playerLightingOf(walled(600), MAP);
    const soon = live.frame({ exploredMask: null }, MAP, 50)!;
    expect(soon.darkness).toBe(first.darkness);
    expect(soon.seen('goblin')).toBe(true);
    vi.advanceTimersByTime(DARKNESS_INTERVAL_MS - 50);
    expect(due).toHaveBeenCalledTimes(1);
    expect(live.frame({ exploredMask: null }, MAP, DARKNESS_INTERVAL_MS)!.darkness).not.toBe(first.darkness);
    live.dispose();
  });

  it('darkens at once, without waiting, when the view\'s sight stops being the scene\'s', () => {
    const lighting = playerLightingOf(walled(), MAP)!;
    const source = lightingSource(lighting);
    const live = new LiveLighting(source.info as PresentedSceneInfo, () => {});
    live.frame({ exploredMask: null }, MAP, 0);
    source.current = { ...lighting, ready: false };
    const frame = live.frame({ exploredMask: null }, MAP, 10)!;
    expect(frame.seen('hero')).toBe(false);
    expect(frame.darkness.covered).toEqual([{ x: 0, y: 0, width: MAP.width, height: MAP.height }]);
  });

  it('decodes the scene\'s explored memory once and shows it when it arrives', async () => {
    const night = scene({ ambient: 0 }, { tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }) } });
    const memory: ExploredImage = exploredImage(MAP, (x) => x > 700);
    const decode = vi.fn(async (): Promise<ExploredImage> => memory);
    const due = vi.fn();
    const live = new LiveLighting(lightingSource(playerLightingOf(night, MAP)).info as PresentedSceneInfo, due, decode);
    const ring = (frame: ReturnType<LiveLighting['frame']>) => {
      const op = frame?.darkness.fog[DARKNESS_FOG_ID];
      return op?.type === 'lasso' ? op.points : [];
    };
    expect(insideByNonzero(ring(live.frame({ exploredMask: 'data:image/png;base64,AA' }, MAP, 0)), { x: 900, y: 400 })).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(due).toHaveBeenCalled();
    expect(insideByNonzero(ring(live.frame({ exploredMask: 'data:image/png;base64,AA' }, MAP, DARKNESS_INTERVAL_MS)), { x: 900, y: 400 })).toBe(false);
    expect(decode).toHaveBeenCalledTimes(1);
    // Forgetting the memory takes effect at once.
    expect(insideByNonzero(ring(live.frame({ exploredMask: null }, MAP, 2 * DARKNESS_INTERVAL_MS)), { x: 900, y: 400 })).toBe(true);
  });

  it('calls back when the view says what players see changed, until disposed', () => {
    const source = lightingSource(playerLightingOf(walled(), MAP));
    const due = vi.fn();
    const live = new LiveLighting(source.info as PresentedSceneInfo, due);
    source.changed();
    expect(due).toHaveBeenCalledTimes(1);
    live.dispose();
    source.changed();
    expect(due).toHaveBeenCalledTimes(1);
  });
});

describe('the broadcaster with dynamic lighting', () => {
  function presentLit(state: Scene, lighting: ReturnType<typeof lightingSource>) {
    const store = createStore(() => ({ ...state, isMapLoading: false, mapLoaded: true, mapPath: 'maps/cave.atlasmap' }));
    const tabs = createTabMetaStore();
    const tab = tabs.getState().addTab('maps/cave.atlasmap', 'Cave');
    tabs.getState().setActiveTab(tab);
    const renderer = {
      getBackgroundSprite: () => ({ ...MAP, destroyed: false }),
      getPlayerLighting: () => lighting.current,
      watchPlayerLighting: (listener: () => void) => lighting.info.watchLighting!(listener),
    };
    const view = { tabMetaStore: tabs, atlasStore: store, register: () => {}, renderer } as unknown as PresentedView;
    const sent: ControlMessage[] = [];
    const session = {
      use: () => () => {},
      send: (_playerId: string, message: ControlMessage) => { sent.push(message); },
      getPlayers: () => [{ playerId: 'p1', name: 'Anna', status: 'admitted' as const }],
    };
    const presented = new PresentedScene();
    const listeners = new Set<() => void>();
    const broadcaster = new SceneBroadcaster({
      session, presented, assets: { ...fakeAssetIds(), onChange: () => () => {} }, notify: () => {},
      settings: { getLocalPlayerViewSettings: () => ({ showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true }), onChange: (l) => { listeners.add(l); return () => listeners.delete(l); } },
    });
    broadcaster.start();
    presented.present(view, tab);
    return { store, sent, broadcaster, lighting };
  }

  it('sends what the player window shows, follows the view\'s sight, and never a wall', async () => {
    const state = walled();
    const lighting = lightingSource(playerLightingOf(state, MAP));
    const { sent, broadcaster } = presentLit(state, lighting);
    const players = (): PlayerScene => broadcaster.currentProjection()!;
    expect(Object.keys(players().tokens)).toEqual(['hero']);
    expect(players().fog[DARKNESS_FOG_ID]).toBeDefined();
    // The view's sight changes without a store change (a statblock's senses were read): players follow,
    // a token they start to see with the darkness that uncovers it.
    lighting.current = playerLightingOf({ ...state, objects: { ...state.objects, walls: {} } }, MAP);
    lighting.changed();
    await vi.advanceTimersByTimeAsync(DARKNESS_INTERVAL_MS + SCENE_TICK_MS);
    expect(Object.keys(players().tokens).sort()).toEqual(['goblin', 'hero']);
    // Nothing is dark without the wall: the darkness goes. Dynamic lighting off then changes nothing more.
    expect(players().fog).toEqual({});
    lighting.current = undefined;
    lighting.changed();
    await vi.advanceTimersByTimeAsync(SCENE_TICK_MS);
    expect(sent.map((message) => message.type)).toEqual(['scene-snapshot', 'scene-fog', 'scene-patch']);
    expect(JSON.stringify(sent)).not.toMatch(/"(walls|p1|vision|lights)"/);
    broadcaster.stop();
  });

  it('projects again when the scene\'s lighting changes in the store', async () => {
    const state = scene({ ambient: 0 }, { tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }) }, lights: { torch: light('torch', 400, 400) } });
    const lighting = lightingSource(playerLightingOf(state, MAP));
    const { store, broadcaster } = presentLit(state, lighting);
    const before = broadcaster.currentProjection();
    const day = { ...state, lighting: { ...state.lighting, ambient: 1 } };
    lighting.current = playerLightingOf(day, MAP);
    store.setState({ lighting: day.lighting } as Partial<ViewAtlasState>);
    await vi.advanceTimersByTimeAsync(DARKNESS_INTERVAL_MS + SCENE_TICK_MS);
    expect(broadcaster.currentProjection()).not.toEqual(before);
    broadcaster.stop();
  });
});
