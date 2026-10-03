/**
 * The Online scene's dice tray, rolled for real: Atlas's toolbar and tray on the real
 * `OnlineSceneView` (its Atlas map view base stood in for), attached to a real
 * `OnlineJoinService` over `MemoryTransport`, with the GM's session and dice host on the other end.
 */
import React from 'react';
import { EventEmitter } from 'events';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, WorkspaceLeaf } from 'obsidian';

const { base } = vi.hoisted(() => ({ base: { current: {} as Record<string, unknown> } }));

// The map view base needs a PIXI renderer; what the Online scene view uses of it is given here.
vi.mock('../../../../src/app/atlas-view', () => ({
  AtlasView: class {
    leaf: WorkspaceLeaf;
    app: App;
    containerEl = document.createElement('div');
    navigation = true;
    constructor(leaf: WorkspaceLeaf) {
      this.leaf = leaf;
      this.app = (leaf as unknown as { app: App }).app;
      Object.assign(this, base.current);
    }
    get isClosed(): boolean { return false; }
    async onOpen(): Promise<void> {}
    async onClose(): Promise<void> {}
    getViewType(): string { return 'atlas-vtt'; }
    onlineControls(): null { return null; }
  },
}));
vi.mock('../../../../src/app/services/PlayerInitiativePanel', () => ({
  PlayerInitiativePanel: class { mount(): void {} present(): void {} hold(): void {} destroy(): void {} },
}));
vi.mock('pixi.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('pixi.js')>(),
  Sprite: class { alpha = 1; width = 0; height = 0; destroyed = false; },
  Texture: { WHITE: {} },
}));
vi.mock('../../../../src/app/keyboard/useMapHotkeys', () => ({
  useHotkeyLabels: () => (id: string) => id,
  useAtlasSettings: () => undefined,
  useMapHotkeys: () => {},
}));
vi.mock('../../../../src/app/clipboard/useMapClipboardHotkeys', () => ({ useMapClipboardHotkeys: () => {} }));
vi.mock('../../../../src/app/react/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../../../../src/app/packages/components/asset-manager/AssetManager', () => ({ default: () => null }));

import { joinedSessionStore } from '../../../../src/app/online/obsidian/joinedSessionStore';
import { OnlineJoinService } from '../../../../src/app/online/obsidian/OnlineJoinService';
import { OnlineSceneView } from '../../../../src/app/online/obsidian/OnlineSceneView';
import { DEFAULT_ONLINE_SETTINGS, type OnlineSettings } from '../../../../src/app/online/onlineSettings';
import { MainToolbar } from '../../../../src/app/packages/components/MainToolbar';
import { LaserHub } from '../../../../src/app/pixi/laser/LaserHub';
import { AtlasUIContext } from '../../../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../../src/app/storeFactory';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { nodeHash } from '../assetFixtures';
import { toolsWorld } from '../toolsFixtures';
import { FakeViewport } from './onlineSceneFixtures';

// jsdom has no scrollTo.
Element.prototype.scrollTo = vi.fn();

function settings() {
  let online: OnlineSettings = { ...DEFAULT_ONLINE_SETTINGS };
  return {
    getOnlineSettings: (): OnlineSettings => online,
    setOnlineSettings: (partial: Partial<OnlineSettings>): void => { online = { ...online, ...partial }; },
    onChange: (): (() => void) => () => {},
  };
}

interface RendererOptions {
  /** Atlas's renderer fails the first time the scene's placeholder map is put down. */
  failFirstBackground?: boolean;
}

/** The GM presents the tavern; Anna joins from Atlas, is let in, and the Online scene tab opens and attaches as in Obsidian. */
async function joinedScene(options: RendererOptions = {}) {
  const w = toolsWorld();
  w.present();
  const vault = createInMemoryApp();
  let failures = options.failFirstBackground ? 1 : 0;
  const renderer = {
    setBackgroundSprite: vi.fn(() => {
      if (failures-- > 0) throw new Error('The renderer is not ready');
    }),
    initGrid: vi.fn(),
    getGridSystem: () => null,
    getLaserHub: () => new LaserHub(),
  };
  const app = {
    ...vault.app,
    workspace: { onLayoutReady: (run: () => void) => run(), getLeavesOfType: () => [], revealLeaf: async () => {} },
  } as unknown as App;
  let view: OnlineSceneView | null = null;
  let store: ViewAtlasStore | null = null;
  const leaf = { app, detach: vi.fn() } as unknown as WorkspaceLeaf;
  const service: OnlineJoinService = new OnlineJoinService(app, settings(), '0.5.0', {
    createClient: () => w.network.client(), openStore: async () => null, decode: async () => null, hash: nodeHash, isHosting: () => false,
    openSceneTab: async () => {
      store = createViewAtlasStore(vault.app, 'online-roll', undefined, false, { remote: true });
      const viewport = new FakeViewport();
      base.current = {
        atlasStore: store,
        renderer,
        serviceManager: {
          getRendererService: () => ({ getViewport: () => viewport }),
          getEventBus: () => new EventEmitter(),
          getSettingsService: () => ({ getLaserPointerSettings: () => ({ color: '#ff0000' }) }),
          getToolController: () => ({ getDiceTool: () => ({ rollDice: vi.fn() }) }),
          getNotePreviewUIManager: () => null,
        },
      };
      view = new OnlineSceneView(leaf);
      await view.onOpen();
    },
  });
  expect(service.join('https://example.org/join/#id=gm', 'Anna')).toBeNull();
  await vi.advanceTimersByTimeAsync(0);
  w.gm.allow(w.gm.getPlayers().find((player) => player.status === 'pending')!.playerId);
  await vi.advanceTimersByTimeAsync(0);
  await w.tick();
  if (!view || !store) throw new Error('The Online scene tab did not open');
  const shown: OnlineSceneView = view;
  const remote: ViewAtlasStore = store;
  render(
    <AtlasUIContext.Provider value={{ app, view: shown, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={remote}><MainToolbar viewId="online-roll" /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return { w, service, view: shown, store: remote, leaf };
}

/** Opens the toolbar's tray, puts a d20 in and presses Roll. */
function rollD20(store: ViewAtlasStore): void {
  act(() => { store.getState().setDiceTrayOpen(true); });
  fireEvent.click(document.querySelector<HTMLButtonElement>('[aria-label="Add a d20"]')!);
  fireEvent.click(document.querySelector<HTMLButtonElement>('.atlas-dice-tray__roll')!);
}

describe("the Online scene's dice tray in a real session", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    joinedSessionStore.setState({ session: null });
    vi.useRealTimers();
  });

  it('rolls through the GM', async () => {
    const { w, service, store } = await joinedScene();
    rollD20(store);
    await vi.advanceTimersByTimeAsync(0);
    expect(w.feed.published.at(-1)).toMatchObject({ formula: 'd20', rolledBy: 'Anna' });
    expect(document.querySelector('.atlas-dice-note')).toBeNull();
    service.dispose();
    w.finish();
  });

  it('still rolls when Atlas\'s renderer failed while the tab took the scene it attached to', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { w, service, view, store, leaf } = await joinedScene({ failFirstBackground: true });
    // The tab stays, shows the scene and says it is connected: only its controls were missing.
    expect(leaf.detach).not.toHaveBeenCalled();
    expect(Object.keys(store.getState().objects.tokens).sort()).toEqual(['ally', 'hero']);
    expect(store.getState().remoteScene?.status.connection).toBe('Connected');
    expect(view.onlineControls()).not.toBeNull();
    rollD20(store);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.atlas-dice-note')).toBeNull();
    expect(w.feed.published.at(-1)).toMatchObject({ formula: 'd20', rolledBy: 'Anna' });
    consoleError.mockRestore();
    service.dispose();
    w.finish();
  });

  it('says the session ended, not to check the connection, once the GM ended it', async () => {
    const { w, service, store } = await joinedScene();
    w.gm.stop();
    await vi.advanceTimersByTimeAsync(0);
    rollD20(store);
    expect(document.querySelector('.atlas-dice-note')?.textContent).toBe('The session has ended. Join again to roll.');
    service.dispose();
    w.finish();
  });
});
