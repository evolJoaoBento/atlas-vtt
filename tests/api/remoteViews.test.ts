import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', async () => import('./fakeAtlasView'));

import { tokensApi } from '../../src/api/tokens';
import { REMOTE_DRAG_CANCEL, REMOTE_TOKEN_DROPPED } from '../../src/app/remote-view/remoteDrag';
import { fitRemoteMap } from '../../src/app/remote-view/remoteFit';
import type { AtlasView as FakeAtlasView } from './fakeAtlasView';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { mapMeasurementSettings } from '../../src/app/services/mapMeasurementSettings';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { remoteScene, remoteToken } from '../unit/remoteSceneFixtures';
import { fakePlugin } from './apiFakes';
import { remoteHarness, remoteHostHarness, type RemoteHarness } from './remoteViewHarness';

/** The store of the remote view `viewId`, as the tracker sees it. */
function storeOf(harness: RemoteHarness, viewId: string): NonNullable<ReturnType<RemoteHarness['tracker']['view']>>['atlasStore'] {
  const view = harness.tracker.view(viewId);
  if (!view) throw new Error(`no view ${viewId}`);
  return view.atlasStore;
}

afterEach(() => { vi.useRealTimers(); });

describe('remoteViews', () => {
  it('C-remote-1: open with reuse reveals the same tab; close fires onClose once; the view is never active() and never saved', async () => {
    vi.useFakeTimers();
    const harness = await remoteHarness();
    const { api, views, workspace, files } = harness;
    const before = JSON.stringify([...files].sort());
    const first = await api.open({ title: 'Online scene', icon: 'network', reuse: true });
    const again = await api.open({ title: 'Online scene', reuse: true });
    expect(again.viewId).toBe(first.viewId);
    expect(workspace.leavesOf('atlas-vtt-remote')).toHaveLength(1);
    expect(workspace.revealed.length).toBeGreaterThanOrEqual(2);
    const closed = vi.fn();
    first.onClose(closed);
    expect(views.list().find((info) => info.viewId === first.viewId)?.kind).toBe('remote');
    // It is the workspace's active view, and still never active().
    expect(views.active()).toBeNull();
    // Never saved: an inert store with no history, and the vault untouched past every save debounce.
    const store = storeOf(harness, first.viewId);
    expect(store.getState().persistenceEnabled).toBe(false);
    store.getState().setPersistenceEnabled(true);
    store.getState().addToken({ x: 10, y: 10, imagePath: 'blob:app://obsidian.md/a' });
    await store.flushStorage();
    await vi.advanceTimersByTimeAsync(5000);
    expect(JSON.stringify([...files].sort())).toBe(before);
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
    first.close();
    first.close();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(workspace.leavesOf('atlas-vtt-remote')).toHaveLength(0);
    expect(views.list()).toEqual([]);
  });

  it('C-remote-2: unloading the extension or Atlas closes its remote views', async () => {
    const { host, plugin, workspace } = await remoteHostHarness();
    const view = await host.api.connect(plugin).remoteViews!.open({ title: 'X' });
    const closed = vi.fn();
    view.onClose(closed);
    plugin.unload();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(workspace.leavesOf('atlas-vtt-remote')).toHaveLength(0);

    const again = await host.api.connect(fakePlugin('ext2')).remoteViews!.open({ title: 'Y' });
    const closedAgain = vi.fn();
    again.onClose(closedAgain);
    host.dispose();
    expect(closedAgain).toHaveBeenCalledTimes(1);
    expect(workspace.leavesOf('atlas-vtt-remote')).toHaveLength(0);
  });

  it('closing the tab by hand closes the handle once, lets the extension go and keeps other owners apart', async () => {
    const harness = await remoteHarness();
    const first = await harness.api.open({ title: 'A' });
    const second = await harness.api.open({ title: 'B' });
    expect(second.viewId).not.toBe(first.viewId);
    const closed = vi.fn();
    first.onClose(closed);
    harness.workspace.leavesOf('atlas-vtt-remote')[0]!.detach();
    expect(closed).toHaveBeenCalledTimes(1);
    first.close();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(harness.workspace.leavesOf('atlas-vtt-remote')).toHaveLength(1);
    harness.dispose();
    expect(harness.workspace.leavesOf('atlas-vtt-remote')).toHaveLength(0);
  });

  it('runs a throwing close listener guarded and still tells the others', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { api } = await remoteHarness();
    const view = await api.open({ title: 'A' });
    const after = vi.fn();
    view.onClose(() => { throw new Error('boom'); });
    view.onClose(after);
    view.close();
    expect(after).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('hands out a frozen handle and refuses a malformed title', async () => {
    const { api } = await remoteHarness();
    const view = await api.open({ title: 'A' });
    expect(Object.isFrozen(view)).toBe(true);
    await expect(api.open({ title: '' })).rejects.toThrow(/title/);
    await expect(api.open({ title: 'A', icon: 3 as never })).rejects.toThrow(/icon/);
  });

  it('C-remote-3: setScene shows in the snapshot, loaded; null unloads; a GM view keeps its own measurement', async () => {
    vi.useFakeTimers();
    const harness = await remoteHarness();
    const before = JSON.stringify([...harness.files].sort());
    const view = await harness.api.open({ title: 'A' });
    view.setScene(remoteScene({ objects: { tokens: { t1: remoteToken('t1'), t2: remoteToken('t2', { x: 300 }) }, texts: {}, drawings: {}, fog: {} } }));
    const snapshot = harness.views.snapshot(view.viewId);
    expect(snapshot?.loaded).toBe(true);
    expect(snapshot?.mapPath).toBe(`remote:${view.viewId}`);
    expect(Object.keys(snapshot?.objects.tokens ?? {})).toEqual(['t1', 't2']);
    const measurement = { ...resolveMeasurementSettings(undefined, null), unitDistance: 10, coneAngle: 60 };
    view.setPlayer({ movableTokenIds: ['t1'], measurement, tokenUi: { conditions: [], resources: {} }, initiative: { rules: null, health: {} } });
    const store = storeOf(harness, view.viewId);
    const assets = { getCollectionForMap: () => null } as never;
    expect(mapMeasurementSettings(assets, store.getState())).toEqual(measurement);
    const gm = createViewAtlasStore(harness.app, 'gm-view');
    expect(mapMeasurementSettings(assets, gm.getState())).toEqual(resolveMeasurementSettings(undefined, gm.getState().grid));
    // Read-only: tokens.move refuses it; nothing of it reaches the vault or the history.
    expect(tokensApi(harness.tracker).move(view.viewId, [{ tokenId: 't1', x: 500, y: 500 }])).toEqual({ ok: false, reason: 'not-loaded' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(JSON.stringify([...harness.files].sort())).toBe(before);
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
    view.setScene(null);
    expect(harness.views.snapshot(view.viewId)?.loaded).toBe(false);
    expect(harness.views.snapshot(view.viewId)?.objects.tokens).toEqual({});
    expect(() => view.setScene({ nonsense: true } as never)).toThrow(/RemoteSceneInput/);
    view.close();
    expect(() => view.setScene(remoteScene())).not.toThrow();
  });

  it('C-remote-4: onTokenDrop fires for movable ids only; lasers work in the remote view; onCameraMoved after a pan and Fit map', async () => {
    const harness = await remoteHarness();
    const view = await harness.api.open({ title: 'A' });
    const fake = harness.tracker.view(view.viewId) as unknown as FakeAtlasView;
    view.setScene(remoteScene({ objects: { tokens: { t1: remoteToken('t1'), t2: remoteToken('t2') }, texts: {}, drawings: {}, fog: {} } }));
    view.setPlayer({ movableTokenIds: ['t1'], measurement: resolveMeasurementSettings(undefined, null), tokenUi: { conditions: [], resources: {} }, initiative: { rules: null, health: {} } });
    const drops = vi.fn();
    view.onTokenDrop(drops);
    fake.eventBus.emit(REMOTE_TOKEN_DROPPED, { tokenId: 't2', x: 1, y: 2 });
    fake.eventBus.emit(REMOTE_TOKEN_DROPPED, { tokenId: 't1', x: 175, y: 105 });
    expect(drops.mock.calls).toEqual([[{ tokenId: 't1', x: 175, y: 105 }]]);
    expect(Object.isFrozen(drops.mock.calls[0]![0])).toBe(true);

    const local = vi.fn();
    harness.lasers.onLocal(view.viewId, local);
    fake.renderer.laserHub.emitLocal({ kind: 'point', x: 5, y: 6 });
    expect(local).toHaveBeenCalledWith({ kind: 'point', x: 5, y: 6 });
    const shown = vi.fn();
    fake.renderer.laserHub.onRemote(shown);
    harness.lasers.show(view.viewId, { from: 'p1', color: '#ff0000', points: [{ x: 1, y: 1 }], lifted: false });
    expect(shown).toHaveBeenCalledOnce();

    const moved = vi.fn();
    view.onCameraMoved(moved);
    view.setCamera({ centerX: 200, centerY: 100, width: 400, height: 300 });
    expect(fake.viewport.center).toEqual({ x: 200, y: 100 });
    expect(moved).not.toHaveBeenCalled();
    fake.viewport.moved('drag');
    expect(moved).toHaveBeenLastCalledWith(true);
    expect(fitRemoteMap(view.viewId)).toBe(true);
    expect(moved).toHaveBeenLastCalledWith(false);
    expect(() => view.setCamera({ centerX: 0, centerY: 0, width: 0, height: 1 })).toThrow(/camera/);
  });

  it('a new scene leaves a dragged token under the pointer, and ends a drag whose token may no longer move', async () => {
    const harness = await remoteHarness();
    const view = await harness.api.open({ title: 'A' });
    const fake = harness.tracker.view(view.viewId) as unknown as FakeAtlasView;
    const store = storeOf(harness, view.viewId);
    const player = { measurement: resolveMeasurementSettings(undefined, null), tokenUi: { conditions: [], resources: {} }, initiative: { rules: null, health: {} } };
    view.setPlayer({ ...player, movableTokenIds: ['t1'] });
    view.setScene(remoteScene());
    store.setState({ isDragging: true, selectedIds: ['t1'] });
    store.getState().setTokenPositions([{ id: 't1', x: 400, y: 400 }]);
    view.setScene(remoteScene({ objects: { tokens: { t1: remoteToken('t1', { x: 120 }) }, texts: {}, drawings: {}, fog: {} } }));
    expect(store.getState().objects.tokens.t1).toMatchObject({ x: 400, y: 400 });
    const cancelled = vi.fn();
    fake.eventBus.on(REMOTE_DRAG_CANCEL, cancelled);
    view.setPlayer({ ...player, movableTokenIds: [] });
    expect(cancelled).toHaveBeenCalledOnce();
    store.setState({ isDragging: false });
    view.cancelDrag();
    expect(store.getState().objects.tokens.t1).toMatchObject({ x: 120, y: 100 });
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
  });
});
