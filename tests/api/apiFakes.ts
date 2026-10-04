import type { App } from 'obsidian';
import type AtlasVTTPlugin from '../../main';
import type { ApiServices } from '../../src/api/services';
import { ApiEvents } from '../../src/api/events';
import type { ConnectingPlugin } from '../../src/api/types/api';
import { ViewTracker, type TrackedMapView } from '../../src/api/viewTracker';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import { createInMemoryApp } from '../mocks/inMemoryVault';

export interface FakePlugin extends ConnectingPlugin {
  /** Runs what `register` was given, as Obsidian does when a plugin unloads. */
  unload(): void;
}

export function fakePlugin(id: string): FakePlugin {
  const cleanups: Array<() => void> = [];
  return {
    manifest: { id, name: id, version: '1.0.0', minAppVersion: '1.8.7', author: 'test', description: '' },
    register: (cleanup: () => void): void => { cleanups.push(cleanup); },
    unload: (): void => { for (const cleanup of cleanups.splice(0)) cleanup(); },
  } as FakePlugin;
}

export interface FakeWorkspaceApp { app: App; triggered: Array<{ name: string; data: unknown[] }> }

export function fakeApp(): FakeWorkspaceApp {
  const triggered: Array<{ name: string; data: unknown[] }> = [];
  const workspace = {
    trigger: (name: string, ...data: unknown[]): void => { triggered.push({ name, data }); },
    on: (): object => ({}),
    offref: (): void => undefined,
    getLeavesOfType: (): unknown[] => [],
    getActiveViewOfType: (): null => null,
  };
  const app = { workspace } as unknown as App;
  return { app, triggered };
}

/** The services every facade is built with; later groups add their fields here as they land. */
export function fakeServices(app: App): ApiServices {
  return { app, plugin: {} as unknown as AtlasVTTPlugin, views: {} as unknown as ViewTracker };
}

export interface FakeView extends TrackedMapView { close(): void }

/** A map view with a real store and tab meta, a 1000 x 500 background and no viewport; `close()` runs what `register` was given. */
export function fakeView(viewId: string): FakeView {
  const { app } = createInMemoryApp();
  const closers: Array<() => void> = [];
  let closed = false;
  const tabs = createTabMetaStore();
  const tabId = tabs.getState().addTab('maps/a.atlasmap', 'A');
  tabs.getState().setActiveTab(tabId);
  return {
    viewId, atlasStore: createViewAtlasStore(app, viewId), tabMetaStore: tabs,
    renderer: { getBackgroundSprite: () => ({ width: 1000, height: 500, destroyed: false }), getViewportInstance: () => null },
    get isClosed(): boolean { return closed; },
    register: (callback: () => void): void => { closers.push(callback); },
    close: (): void => { closed = true; for (const callback of closers.splice(0)) callback(); },
  };
}

/** An app whose workspace holds `views` (open ones only) and reports `active()` as the active view; `layoutChanged()` fires `layout-change`. */
export function workspaceWith(views: FakeView[], active: () => FakeView | null = () => null): { app: App; layoutChanged(): void } {
  let onLayout: () => void = () => undefined;
  const app = {
    workspace: {
      getLeavesOfType: () => views.filter((view) => !view.isClosed).map((view) => ({ view })),
      getActiveViewOfType: () => active(),
      on: (_name: string, callback: () => void) => { onLayout = callback; return {}; },
      offref: () => undefined,
    },
  } as unknown as App;
  return { app, layoutChanged: () => onLayout() };
}

/** A started tracker over `views` (fake views are recognised by their store), plus the events it emits to. */
export function trackerWith(views: FakeView[], active: () => FakeView | null = () => null): { tracker: ViewTracker; events: ApiEvents; layoutChanged(): void } {
  const { app, layoutChanged } = workspaceWith(views, active);
  const events = new ApiEvents();
  const tracker = new ViewTracker(app, events, {
    viewType: 'atlas-vtt',
    isMapView: (view): view is TrackedMapView => typeof view === 'object' && view !== null && 'atlasStore' in view,
    activeView: (workspaceApp) => (workspaceApp.workspace as unknown as { getActiveViewOfType(): unknown }).getActiveViewOfType(),
  });
  tracker.start();
  return { tracker, events, layoutChanged };
}

/** Marks `view`'s store as holding `maps/a.atlasmap`, loaded. */
export function loadMap(view: FakeView): void {
  view.atlasStore.setState({ mapPath: 'maps/a.atlasmap', mapLoaded: true, isMapLoading: false });
}
