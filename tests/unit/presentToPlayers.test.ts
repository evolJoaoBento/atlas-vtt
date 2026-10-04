import type { Command, Plugin } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class AtlasView {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));
vi.mock('../../src/app/dashboard-view', () => ({ DASHBOARD_VIEW_TYPE: 'dashboard' }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: {} }));
vi.mock('../../src/app/plugin/cleanupMissingAssets', () => ({ cleanupMissingAssets: vi.fn() }));

import { AtlasView } from '../../src/app/atlas-view';
import { registerCommands, type CommandDependencies } from '../../src/app/plugin/registerCommands';
import { presentedScene } from '../../src/app/services/PresentedScene';
import { presentActiveTabToPlayers, presentViewToPlayers, stopPresenting } from '../../src/app/services/presentToPlayers';

function fakeView(): { view: object; tabId: string; store: ReturnType<typeof createStore<{ isMapLoading: boolean }>> } {
  const tabMetaStore = createTabMetaStore();
  const store = createStore<{ isMapLoading: boolean }>(() => ({ isMapLoading: false }));
  const view = { tabMetaStore, atlasStore: store, register: vi.fn() };
  Object.setPrototypeOf(view, AtlasView.prototype);
  const tabId = tabMetaStore.getState().addTab('maps/tavern.atlasmap', 'Tavern');
  return { view, tabId, store };
}

function fakeApp(view: object | null): { workspace: { getActiveViewOfType: () => object | null; openPopoutLeaf: ReturnType<typeof vi.fn> } } {
  return { workspace: { getActiveViewOfType: () => view, openPopoutLeaf: vi.fn() } };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('Present to players', () => {
  beforeEach(() => { presentedScene.clear(); });

  it('presents the active scene without opening the player window', async () => {
    const { view, tabId } = fakeView();
    const app = fakeApp(view);
    await presentActiveTabToPlayers(app as never);
    expect(presentedScene.current()).toMatchObject({ view, tabId });
    expect(app.workspace.openPopoutLeaf).not.toHaveBeenCalled();
  });

  it('waits for the scene to finish loading', async () => {
    const { view, tabId, store } = fakeView();
    store.setState({ isMapLoading: true });
    const presenting = presentViewToPlayers(view);
    await flush();
    expect(presentedScene.current()).toBeNull();
    store.setState({ isMapLoading: false });
    await presenting;
    expect(presentedScene.current()?.tabId).toBe(tabId);
  });

  it('does not present a view that closed while its scene was loading', async () => {
    const { view, store } = fakeView();
    store.setState({ isMapLoading: true });
    const presenting = presentViewToPlayers(view);
    await flush();
    (view as { isClosed?: boolean }).isClosed = true;
    store.setState({ isMapLoading: false });
    await presenting;
    expect(presentedScene.current()).toBeNull();
  });

  it('does nothing without an open scene', async () => {
    await presentActiveTabToPlayers(fakeApp(null) as never);
    await presentViewToPlayers({ not: 'a view' });
    expect(presentedScene.current()).toBeNull();
  });

  it('stops presenting', async () => {
    const { view } = fakeView();
    await presentViewToPlayers(view);
    stopPresenting();
    expect(presentedScene.current()).toBeNull();
  });

  it('adds the commands, with Stop presenting only while a scene is presented', async () => {
    const { view, tabId } = fakeView();
    const commands: Command[] = [];
    const plugin = {
      app: fakeApp(view),
      addCommand: (command: Command) => commands.push(command),
      addRibbonIcon: vi.fn(),
    } as unknown as Plugin;
    registerCommands(plugin, {} as CommandDependencies);
    const present = commands.find((command) => command.id === 'present-to-players');
    const stop = commands.find((command) => command.id === 'stop-presenting');
    expect(present?.name).toBe('Present to players');
    expect(stop?.checkCallback?.(true)).toBe(false);
    present?.callback?.();
    await flush();
    expect(presentedScene.current()?.tabId).toBe(tabId);
    expect(stop?.checkCallback?.(true)).toBe(true);
    stop?.checkCallback?.(false);
    expect(presentedScene.current()).toBeNull();
  });
});
