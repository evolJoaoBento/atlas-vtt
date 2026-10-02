import { describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { RemoteSceneApplier } from '../../../../src/app/online/obsidian/RemoteSceneApplier';
import type { RemoteImages } from '../../../../src/app/online/obsidian/remoteScene';
import { applyPatch } from '../../../../src/app/online/scene/sceneDiff';
import type { ScenePoint } from '../../../../src/app/online/scene/sceneTypes';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';
import { getHistoryStore } from '../../../../src/app/stores/history';
import { playerScene, playerToken } from '../sceneFixtures';

let count = 0;

function setup(positionOf?: (tokenId: string) => ScenePoint | null) {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `remote-${count++}`, undefined, false, { remote: true });
  const urls = new Map<string, string>();
  const images: RemoteImages = {
    background: (id) => (id ? urls.get(`map:${id}`) ?? null : null),
    token: (id) => (id ? urls.get(`token:${id}`) ?? null : null),
  };
  const applier = new RemoteSceneApplier({ store, images, ...(positionOf ? { positionOf } : {}) });
  return { store, applier, urls };
}

describe('RemoteSceneApplier', () => {
  it("writes the scene into the store, and the GM's measurement and the badges into its remote part", () => {
    const { store, applier } = setup();
    const scene = playerScene({ tokens: { t1: playerToken({ name: 'A', conditions: [{ id: 'prone', value: null }] }) } });
    applier.apply(scene);
    const state = store.getState();
    expect(applier.current).toBe(scene);
    expect(Object.keys(state.objects.tokens)).toEqual(['t1']);
    expect(state.objects.texts.x1?.text).toBe('Tavern');
    expect(state.initiativeTrackerOpen).toBe(true);
    expect(state.remoteScene?.measurement).toMatchObject({ mode: 'metric', unitDistance: 5 });
    expect(state.remoteScene?.conditions.map((condition) => condition.id)).toEqual(['prone']);
  });

  it('keeps unchanged Atlas records as the same objects across a patch, so renderers redraw only what changed', () => {
    const { store, applier } = setup();
    const scene = playerScene({ tokens: { t1: playerToken(), t2: playerToken({ x: 300 }) } });
    applier.apply(scene);
    const before = store.getState();
    applier.apply(applyPatch(scene, { set: {}, upsert: { tokens: { t2: playerToken({ x: 370 }) } }, remove: {} }));
    const after = store.getState();
    expect(after.objects.tokens.t1).toBe(before.objects.tokens.t1);
    expect(after.objects.tokens.t2?.x).toBe(370);
    expect(after.objects.fog).toBe(before.objects.fog);
    expect(after.objects.pins).toBe(before.objects.pins);
    expect(after.grid).toBe(before.grid);
    expect(after.widgetSettings).toBe(before.widgetSettings);
    expect(after.initiative).toBe(before.initiative);
  });

  it('writes nothing when nothing changed', () => {
    const { store, applier } = setup();
    const scene = playerScene();
    applier.apply(scene);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    applier.apply(scene);
    applier.refresh();
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('shows an image once it arrives, rebuilding only what shows it', () => {
    const { store, applier, urls } = setup();
    applier.apply(playerScene({ tokens: { t1: playerToken({ image: 'a' }), t2: playerToken({ image: 'b' }) } }));
    const before = store.getState();
    urls.set('token:a', 'blob:app://obsidian.md/token-a');
    urls.set('map:map-asset', 'blob:app://obsidian.md/map');
    applier.refresh();
    const after = store.getState();
    expect(after.objects.tokens.t1?.imagePath).toBe('blob:app://obsidian.md/token-a');
    expect(after.objects.tokens.t2).toBe(before.objects.tokens.t2);
    expect(after.background).toBe('blob:app://obsidian.md/map');
  });

  it("keeps a position this view shows over the GM's until it lets go", () => {
    let shown: ScenePoint | null = { x: 500, y: 600 };
    const { store, applier } = setup((id) => (id === 't1' ? shown : null));
    applier.apply(playerScene());
    expect(store.getState().objects.tokens.t1).toMatchObject({ x: 500, y: 600 });
    shown = null;
    applier.refresh();
    expect(store.getState().objects.tokens.t1).toMatchObject({ x: 100, y: 100 });
  });

  it('clears the map when the GM shows no scene', () => {
    const { store, applier } = setup();
    applier.apply(playerScene());
    applier.apply(null);
    const state = store.getState();
    expect(applier.current).toBeNull();
    expect(state.objects.tokens).toEqual({});
    expect(state.objects.fog).toEqual({});
    expect(state.background).toBeNull();
    expect(state.initiativeTrackerOpen).toBe(false);
    expect(state.widgetSettings.widgets).toEqual({});
    expect(state.remoteScene?.conditions).toEqual([]);
  });

  it('records no undo step', () => {
    const { store, applier } = setup();
    applier.apply(playerScene());
    applier.apply(playerScene({ tokens: {} }));
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
  });
});
