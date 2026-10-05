import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', async () => import('./fakeAtlasView'));

import { getHistoryStore } from '../../src/app/stores/history';
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
});
