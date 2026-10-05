import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class AtlasView {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));
vi.mock('../../src/app/dashboard-view', () => ({ DASHBOARD_VIEW_TYPE: 'dashboard' }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn(), presentTabInPlayerWindow: vi.fn() }));
vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), Notice: vi.fn() }));

import { AtlasView } from '../../src/app/atlas-view';
import { DisposerSet } from '../../src/api/disposers';
import { presentationApi } from '../../src/api/presentation';
import { presentedScene } from '../../src/app/services/PresentedScene';
import { activePresentationTarget } from '../../src/app/services/presentationTargets';
import { playerWindowStore } from '../../src/app/stores/playerWindowStore';
import { fakeView, loadMap as load, trackerWith, type FakeView } from './apiFakes';

function setupWith(view: FakeView): { presentation: ReturnType<typeof presentationApi>; disposers: DisposerSet } {
  // The present path recognises Atlas's views by class.
  Object.setPrototypeOf(view, AtlasView.prototype);
  load(view);
  const disposers = new DisposerSet();
  return { presentation: presentationApi(trackerWith([view]).tracker, disposers, 'ext'), disposers };
}

describe('presentation', () => {
  beforeEach(() => {
    presentedScene.clear();
    playerWindowStore.setState({ isOpen: true });
  });
  afterEach(() => { presentedScene.clear(); });

  it('C-pres-1: present returns false for a closed view; held on tab switch; resumed only after the tab loaded; cleared when the tab closes', async () => {
    const view = fakeView('v1');
    const { presentation } = setupWith(view);
    const seen: string[] = [];
    presentation.subscribe({
      presented: (scene, resumed) => seen.push(`presented:${scene.tabId}:${resumed}`),
      held: (scene) => seen.push(`held:${scene.tabId}`),
      cleared: () => seen.push('cleared'),
    });
    const tabId = view.tabMetaStore.getState().activeTabId!;
    expect(await presentation.present('v1', tabId)).toBe(true);
    expect(presentation.current()).toMatchObject({ viewId: 'v1', tabId, mapPath: 'maps/a.atlasmap', held: false });
    expect(Object.isFrozen(presentation.current())).toBe(true);
    const other = view.tabMetaStore.getState().addTab('maps/b.atlasmap', 'B');
    expect(seen.at(-1)).toBe(`held:${tabId}`);
    view.atlasStore.setState({ isMapLoading: true });
    view.tabMetaStore.getState().setActiveTab(tabId);
    await Promise.resolve();
    expect(seen.at(-1)).toBe(`held:${tabId}`);           // still loading: no resume
    load(view);
    await Promise.resolve();
    expect(seen.at(-1)).toBe(`presented:${tabId}:true`);
    view.tabMetaStore.getState().removeTab(tabId);
    expect(seen.at(-1)).toBe('cleared');
    view.close();
    expect(await presentation.present('v1')).toBe(false);
    void other;
  });

  it('C-pres-2: addTarget makes a target active for the eye; its disposer removes it', () => {
    const { presentation } = setupWith(fakeView('v1'));
    const stop = presentation.addTarget({ id: 'online', label: 'online players', isActive: () => true });
    expect(activePresentationTarget()?.label).toBe('online players');
    stop();
    stop();
    expect(activePresentationTarget()).toBeNull();
  });

  it('present resolves false when the scene stays held (its map did not load), and stop clears the scene', async () => {
    const view = fakeView('v1');
    const { presentation } = setupWith(view);
    view.atlasStore.setState({ mapLoaded: false });
    view.switchToTab = (): Promise<void> => Promise.resolve();
    expect(await presentation.present('v1')).toBe(false);
    load(view);
    expect(await presentation.present('v1')).toBe(true);
    presentation.stop();
    expect(presentation.current()).toBeNull();
  });

  it('removes its listener and target when the extension is disposed', () => {
    const { presentation, disposers } = setupWith(fakeView('v1'));
    const listener = vi.fn();
    presentation.subscribe({ cleared: listener });
    presentation.addTarget({ id: 'online', label: 'online players', isActive: () => true });
    disposers.disposeAll();
    expect(activePresentationTarget()).toBeNull();
    const view = fakeView('v2');
    load(view);
    presentedScene.present(view as never, view.tabMetaStore.getState().activeTabId!);
    presentedScene.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it('present resolves false instead of throwing when switching the tab fails', async () => {
    const view = fakeView('v1');
    const { presentation } = setupWith(view);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    view.switchToTab = (): Promise<void> => Promise.reject(new Error('boom'));
    expect(await presentation.present('v1')).toBe(false);
    error.mockRestore();
  });

  it('cleared reports whether the scene was held', () => {
    const view = fakeView('v1');
    const { presentation } = setupWith(view);
    const seen: boolean[] = [];
    presentation.subscribe({ cleared: (scene) => seen.push(scene.held) });
    const tabId = view.tabMetaStore.getState().activeTabId!;
    presentedScene.present(view as never, tabId);
    presentedScene.clear();
    view.tabMetaStore.getState().addTab('maps/b.atlasmap', 'B');
    presentedScene.present(view as never, tabId);
    expect(presentation.current()?.held).toBe(true);
    presentedScene.clear();
    expect(seen).toEqual([false, true]);
  });

  it('addTarget rejects an argument that is not a target', () => {
    const { presentation } = setupWith(fakeView('v1'));
    expect(() => presentation.addTarget({ id: 'x', label: 'x' } as never)).toThrow(/addTarget needs/);
    expect(() => presentation.addTarget(null as never)).toThrow(/addTarget needs/);
  });
});
