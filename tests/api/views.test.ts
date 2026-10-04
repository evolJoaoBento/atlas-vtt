import { describe, expect, it, vi } from 'vitest';
import { DisposerSet } from '../../src/api/disposers';
import { viewsApi } from '../../src/api/views';
import { fakeView, loadMap, trackerWith, type FakeView } from './apiFakes';

function setup(views: FakeView[], active: () => FakeView | null = () => null): ReturnType<typeof trackerWith> & { api: ReturnType<typeof viewsApi> } {
  const tracked = trackerWith(views, active);
  return { ...tracked, api: viewsApi(tracked.tracker, new DisposerSet()) };
}

describe('views', () => {
  it('C-views-1: snapshot is null for an unknown or closed view', () => {
    const view = fakeView('v1');
    const { api } = setup([view]);
    expect(api.snapshot('nope')).toBeNull();
    view.close();
    expect(api.snapshot('v1')).toBeNull();
  });

  it('C-views-2: loaded is false while the map loads; subscribe fires on a replaced field, not on the camera', () => {
    const view = fakeView('v1');
    const { api } = setup([view]);
    view.atlasStore.setState({ mapPath: 'maps/a.atlasmap', mapLoaded: true, isMapLoading: true });
    expect(api.snapshot('v1')!.loaded).toBe(false);
    loadMap(view);
    const listener = vi.fn();
    api.subscribe('v1', listener);
    view.atlasStore.getState().setCamera({ zoom: 2 });
    expect(listener).not.toHaveBeenCalled();
    view.atlasStore.setState((state) => ({ objects: { ...state.objects, tokens: { ...state.objects.tokens } } }));
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = listener.mock.calls[0]![0];
    expect(snapshot.objects.tokens).toBe(view.atlasStore.getState().objects.tokens);
    expect(snapshot.mapSize).toEqual({ width: 1000, height: 500 });
  });

  it('C-views-2: a snapshot passes the store records by reference and carries no pins, walls, lights or audio', () => {
    const view = fakeView('v1');
    const { api } = setup([view]);
    loadMap(view);
    const state = view.atlasStore.getState();
    const snapshot = api.snapshot('v1')!;
    expect(snapshot.objects.fog).toBe(state.objects.fog);
    expect(snapshot.objects.texts).toBe(state.objects.texts);
    expect(snapshot.objects.drawings).toBe(state.objects.drawings);
    expect(snapshot.widgets.settings).toBe(state.widgetSettings);
    expect(snapshot.lighting).toBe(state.lighting);
    expect(snapshot.grid).toBe(state.grid);
    expect(Object.keys(snapshot.objects).sort()).toEqual(['drawings', 'fog', 'texts', 'tokens']);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('C-views-4: map-loaded fires once per load, map-closed once on close', () => {
    const view = fakeView('v1');
    const { events } = setup([view]);
    const loaded = vi.fn();
    const closed = vi.fn();
    events.on('map-loaded', loaded);
    events.on('map-closed', closed);
    loadMap(view);
    loadMap(view);
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(loaded.mock.calls[0]![0]).toMatchObject({ viewId: 'v1', kind: 'map', mapPath: 'maps/a.atlasmap', loaded: true });
    view.close();
    view.close();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledWith('v1');
  });

  it('C-views-3: list shows map views only, picked up on layout change', () => {
    const views = [fakeView('v1')];
    const { api, layoutChanged } = setup(views);
    views.push(fakeView('v2'));
    layoutChanged();
    expect(api.list().map((info) => info.viewId)).toEqual(['v1', 'v2']);
    expect(api.list().every((info) => info.kind === 'map')).toBe(true);
  });

  it("C-views-3: active is the workspace's active map view, or null when there is none or it is not tracked", () => {
    const first = fakeView('v1');
    let current: FakeView | null = null;
    const { api } = setup([first], () => current);
    expect(api.active()).toBeNull();
    current = first;
    expect(api.active()?.viewId).toBe('v1');
    current = fakeView('v3');
    expect(api.active()).toBeNull();
    current = first;
    first.close();
    expect(api.active()).toBeNull();
  });

  it('C-views-5: camera is null without a viewport, and watchCamera is a harmless no-op', () => {
    const view = fakeView('v1');
    const { api } = setup([view]);
    expect(api.camera('v1')).toBeNull();
    const stop = api.watchCamera('v1', () => undefined);
    stop();
    stop();
  });
});
