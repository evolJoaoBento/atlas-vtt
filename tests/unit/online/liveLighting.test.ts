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
import type { TextElement } from '../../../src/app/types';
import { character, exploredImage, light, MAP, playerLightingOf, project, scene, wall, type Scene } from './lightingFixtures';
import { fakeAssetIds, insideByNonzero } from './sceneFixtures';

/** The presented view's lighting, as a test sets it: `lighting` is what `getPlayerLighting` answers. */
function lightingSource(initial: PlayerLighting | null | undefined): { current: PlayerLighting | null | undefined; changed(): void; info: Pick<PresentedSceneInfo, 'lighting' | 'watchLighting'> } {
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

const LIT = scene({}).lighting;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('live lighting of a presentation', () => {
  it('is nothing while the scene is unlit or dynamic lighting is off', () => {
    const source = lightingSource(null);
    const live = new LiveLighting(source.info as PresentedSceneInfo, () => {});
    expect(live.frame({ exploredMask: null, lighting: scene({}).lighting }, MAP)).toBeNull();
  });

  it('follows tokens at once and works the darkness out at most every interval, calling back when it is due', () => {
    const source = lightingSource(playerLightingOf(walled(), MAP));
    const due = vi.fn();
    const live = new LiveLighting(source.info as PresentedSceneInfo, due);
    const first = live.frame({ exploredMask: null, lighting: LIT }, MAP, 0)!;
    source.current = playerLightingOf(walled(600), MAP);
    const soon = live.frame({ exploredMask: null, lighting: LIT }, MAP, 50)!;
    expect(soon.darkness).toBe(first.darkness);
    expect(soon.seen('goblin')).toBe(true);
    vi.advanceTimersByTime(DARKNESS_INTERVAL_MS - 50);
    expect(due).toHaveBeenCalledTimes(1);
    expect(live.frame({ exploredMask: null, lighting: LIT }, MAP, DARKNESS_INTERVAL_MS)!.darkness).not.toBe(first.darkness);
    live.dispose();
  });

  it('darkens at once, without waiting, when the view\'s sight stops being the scene\'s', () => {
    const lighting = playerLightingOf(walled(), MAP)!;
    const source = lightingSource(lighting);
    const live = new LiveLighting(source.info as PresentedSceneInfo, () => {});
    live.frame({ exploredMask: null, lighting: LIT }, MAP, 0);
    source.current = { ...lighting, ready: false };
    const frame = live.frame({ exploredMask: null, lighting: LIT }, MAP, 10)!;
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
    expect(insideByNonzero(ring(live.frame({ exploredMask: 'data:image/png;base64,AA', lighting: LIT }, MAP, 0)), { x: 900, y: 400 })).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(due).toHaveBeenCalled();
    expect(insideByNonzero(ring(live.frame({ exploredMask: 'data:image/png;base64,AA', lighting: LIT }, MAP, DARKNESS_INTERVAL_MS)), { x: 900, y: 400 })).toBe(false);
    expect(decode).toHaveBeenCalledTimes(1);
    // Forgetting the memory takes effect at once.
    expect(insideByNonzero(ring(live.frame({ exploredMask: null, lighting: LIT }, MAP, 2 * DARKNESS_INTERVAL_MS)), { x: 900, y: 400 })).toBe(true);
  });

  it('fails closed when the view cannot tell: a lit scene with no renderer or lighting state shows nothing', () => {
    const source = lightingSource(undefined);
    const live = new LiveLighting(source.info as PresentedSceneInfo, () => {});
    const closed = live.frame({ exploredMask: null, lighting: LIT }, MAP)!;
    expect(closed.seen('hero')).toBe(false);
    expect(closed.darkness.covered).toEqual([{ x: 0, y: 0, width: MAP.width, height: MAP.height }]);
    expect(live.frame({ exploredMask: null, lighting: { ...LIT, enabled: false } }, MAP)).toBeNull();
  });

  it('watches the view once it can be watched, though it had no renderer at first', () => {
    const source = lightingSource(playerLightingOf(walled(), MAP));
    let watchable = false;
    const info = { lighting: source.info.lighting, watchLighting: (listener: () => void) => (watchable ? source.info.watchLighting!(listener) : null) };
    const due = vi.fn();
    const live = new LiveLighting(info as PresentedSceneInfo, due);
    source.changed();
    expect(due).not.toHaveBeenCalled();
    watchable = true;
    live.frame({ exploredMask: null, lighting: LIT }, MAP, 0);
    source.changed();
    expect(due).toHaveBeenCalledTimes(1);
    live.dispose();
  });

  it('lets no memory decoded before stand in once the scene reloads in place', async () => {
    const night = scene({ ambient: 0 }, { tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }) } });
    const memories: Record<string, ExploredImage> = { 'data:a': exploredImage(MAP, (x) => x > 700), 'data:b': exploredImage(MAP, () => false) };
    let finish: (() => void) | null = null;
    const decode = vi.fn((mask: string) => new Promise<ExploredImage>((resolve) => { finish = () => resolve(memories[mask]!); }));
    const live = new LiveLighting(lightingSource(playerLightingOf(night, MAP)).info as PresentedSceneInfo, () => {}, decode);
    const darkAt = (mask: string, now: number): boolean => {
      const op = live.frame({ exploredMask: mask, lighting: LIT }, MAP, now)?.darkness.fog[DARKNESS_FOG_ID];
      return insideByNonzero(op?.type === 'lasso' ? op.points : [], { x: 900, y: 400 });
    };
    darkAt('data:a', 0);
    finish!();
    await vi.advanceTimersByTimeAsync(0);
    expect(darkAt('data:a', DARKNESS_INTERVAL_MS)).toBe(false);
    // Reloaded in place with another mask: until it decodes, the old one does not stand in.
    live.restart();
    expect(darkAt('data:b', 2 * DARKNESS_INTERVAL_MS)).toBe(true);
  });

  it('shows less at once when the explored memory is edited by hand, never the memory it had', async () => {
    const night = scene({ ambient: 0 }, { tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }) } });
    const decode = vi.fn(() => new Promise<ExploredImage>(() => {}));
    const first = vi.fn(() => Promise.resolve(exploredImage(MAP, (x) => x > 700)));
    decode.mockImplementationOnce(first);
    const live = new LiveLighting(lightingSource(playerLightingOf(night, MAP)).info as PresentedSceneInfo, () => {}, decode);
    const darkAt = (edits: number, now: number): boolean => {
      const op = live.frame({ exploredMask: 'data:a', exploredEdits: edits, lighting: LIT }, MAP, now)?.darkness.fog[DARKNESS_FOG_ID];
      return insideByNonzero(op?.type === 'lasso' ? op.points : [], { x: 900, y: 400 });
    };
    darkAt(0, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(darkAt(0, DARKNESS_INTERVAL_MS)).toBe(false);
    // Within the interval and with the same edits the last darkness is held, with the memory in it.
    expect(darkAt(0, DARKNESS_INTERVAL_MS + 10)).toBe(false);
    // A forget (or an undo) moves the count: dark at once, though the new mask has not decoded and the interval has not passed.
    expect(darkAt(1, DARKNESS_INTERVAL_MS + 20)).toBe(true);
  });

  describe('texts and drawings never follow a darkness held back', () => {
    const textAt = (x: number, y: number): TextElement => ({ id: 't', kind: 'text', x, y, text: 'a', fontSize: 1, fontFamily: 'serif', color: '#000000', width: 10, height: 10 } as TextElement);
    const sentIn = (state: Scene, frame: ReturnType<LiveLighting['frame']>): string[] => Object.keys(project(state, frame).texts);

    it('hides a text where a light just went out, though the fog op is held for the interval', () => {
      const lit = scene({ ambient: 0 }, {
        tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }) },
        lights: { torch: light('torch', 400, 400) },
        texts: { t: textAt(420, 400) },
      });
      const dark = { ...lit, objects: { ...lit.objects, lights: {} } };
      const source = lightingSource(playerLightingOf(lit, MAP));
      const live = new LiveLighting(source.info as PresentedSceneInfo, () => {});
      const first = live.frame({ exploredMask: null, lighting: LIT }, MAP, 0)!;
      expect(sentIn(lit, first)).toEqual(['t']);
      source.current = playerLightingOf(dark, MAP);
      const soon = live.frame({ exploredMask: null, lighting: LIT }, MAP, 10)!;
      // The fog op still shows the lit spot, held; the text is not sent.
      expect(soon.darkness).toBe(first.darkness);
      expect(sentIn(lit, soon)).toEqual([]);
      live.dispose();
    });

    it('hides a text in the explored memory when it is switched off', async () => {
      const night = scene({ ambient: 0 }, { tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }) }, texts: { t: textAt(900, 400) } });
      const decode = vi.fn(async (): Promise<ExploredImage> => exploredImage(MAP, (x) => x > 700));
      const lighting = playerLightingOf(night, MAP)!;
      const source = lightingSource(lighting);
      const live = new LiveLighting(source.info as PresentedSceneInfo, () => {}, decode);
      live.frame({ exploredMask: 'data:a', lighting: LIT }, MAP, 0);
      await vi.advanceTimersByTimeAsync(0);
      const first = live.frame({ exploredMask: 'data:a', lighting: LIT }, MAP, DARKNESS_INTERVAL_MS)!;
      expect(sentIn(night, first)).toEqual(['t']);
      source.current = { ...lighting, showsExplored: false };
      const soon = live.frame({ exploredMask: 'data:a', lighting: LIT }, MAP, DARKNESS_INTERVAL_MS + 10)!;
      expect(soon.darkness).toBe(first.darkness);
      expect(sentIn(night, soon)).toEqual([]);
      live.dispose();
    });

    it('drops the hold at once when the saved memory is cleared outright (the reset fallback), fog op and texts', async () => {
      const night = scene({ ambient: 0 }, { tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }) }, texts: { t: textAt(900, 400) } });
      const decode = vi.fn(async (): Promise<ExploredImage> => exploredImage(MAP, (x) => x > 700));
      const live = new LiveLighting(lightingSource(playerLightingOf(night, MAP)).info as PresentedSceneInfo, () => {}, decode);
      live.frame({ exploredMask: 'data:a', lighting: LIT }, MAP, 0);
      await vi.advanceTimersByTimeAsync(0);
      const first = live.frame({ exploredMask: 'data:a', lighting: LIT }, MAP, DARKNESS_INTERVAL_MS)!;
      expect(sentIn(night, first)).toEqual(['t']);
      // The same edit count, the mask gone, 10 ms later: nothing in the old memory is held.
      const soon = live.frame({ exploredMask: null, lighting: LIT }, MAP, DARKNESS_INTERVAL_MS + 10)!;
      expect(soon.darkness).not.toBe(first.darkness);
      expect(sentIn(night, soon)).toEqual([]);
      live.dispose();
    });

    it('is not fooled by a darkness held across a map size that was unknown (0 x 0) and then known', () => {
      const state = scene({ ambient: 1 }, {
        tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }) },
        walls: { w: wall('w', { x: 503, y: -10 }, { x: 503, y: 810 }) },
        texts: { t: textAt(800, 400) },
      });
      const live = new LiveLighting(lightingSource(playerLightingOf(state, MAP)).info as PresentedSceneInfo, () => {});
      const unknown = live.frame({ exploredMask: null, lighting: LIT }, { width: 0, height: 0 }, 0)!;
      expect(sentIn(state, unknown)).toEqual([]);
      const known = live.frame({ exploredMask: null, lighting: LIT }, MAP, 50)!;
      expect(known.darkness).not.toBe(unknown.darkness);
      expect(sentIn(state, known)).toEqual([]);
      live.dispose();
    });
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
    // The view's sight changes without a store change (a statblock's senses were read): players get the
    // token they now see at the next tick, and the darkness when its interval is over.
    lighting.current = playerLightingOf({ ...state, objects: { ...state.objects, walls: {} } }, MAP);
    lighting.changed();
    await vi.advanceTimersByTimeAsync(SCENE_TICK_MS);
    expect(Object.keys(players().tokens).sort()).toEqual(['goblin', 'hero']);
    expect(players().fog[DARKNESS_FOG_ID]).toBeDefined();
    await vi.advanceTimersByTimeAsync(DARKNESS_INTERVAL_MS);
    // Nothing is dark without the wall: the darkness goes. Dynamic lighting off then changes nothing more.
    expect(players().fog).toEqual({});
    lighting.current = null;
    lighting.changed();
    await vi.advanceTimersByTimeAsync(SCENE_TICK_MS);
    expect(sent.map((message) => message.type)).toEqual(['scene-snapshot', 'scene-fog', 'scene-patch', 'scene-patch']);
    expect(JSON.stringify(sent)).not.toMatch(/"(walls|p1|vision|lights)"/);
    broadcaster.stop();
  });

  it('keeps a seen token while its darkness waits: the hero dragged through the dark never drops out', async () => {
    const at = (x: number): Scene => scene({ ambient: 0 }, { tokens: { hero: character('hero', x, 400, { vision: { enabled: true } }) } });
    const lighting = lightingSource(playerLightingOf(at(140), MAP));
    const { store, broadcaster } = presentLit(at(140), lighting);
    for (const x of [280, 420]) {
      const moved = at(x);
      lighting.current = playerLightingOf(moved, MAP);
      store.setState({ objects: moved.objects } as Partial<ViewAtlasState>);
      await vi.advanceTimersByTimeAsync(SCENE_TICK_MS);
      expect(broadcaster.currentProjection()?.tokens.hero?.x).toBe(x);
    }
    broadcaster.stop();
  });

  it('sends no token and full darkness for a lit scene whose view has no renderer', () => {
    const state = walled();
    const store = createStore(() => ({ ...state, isMapLoading: false, mapLoaded: true, mapPath: 'maps/cave.atlasmap' }));
    const tabs = createTabMetaStore();
    const tab = tabs.getState().addTab('maps/cave.atlasmap', 'Cave');
    tabs.getState().setActiveTab(tab);
    const view = { tabMetaStore: tabs, atlasStore: store, register: () => {}, renderer: null } as unknown as PresentedView;
    const presented = new PresentedScene();
    const broadcaster = new SceneBroadcaster({
      session: { use: () => () => {}, send: () => {}, getPlayers: () => [] }, presented, assets: { ...fakeAssetIds(), onChange: () => () => {} }, notify: () => {},
      settings: { getLocalPlayerViewSettings: () => ({ showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true }), onChange: () => () => {} },
    });
    broadcaster.start();
    presented.present(view, tab);
    expect(broadcaster.currentProjection()?.tokens).toEqual({});
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
