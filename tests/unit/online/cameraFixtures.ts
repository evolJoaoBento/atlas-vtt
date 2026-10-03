import { createStore, type StoreApi } from 'zustand/vanilla';
import type { CameraViewport } from '../../../src/app/services/presentedCamera';
import type { PresentedView } from '../../../src/app/services/PresentedScene';
import type { ViewAtlasState } from '../../../src/app/storeFactory';
import { createTabMetaStore } from '../../../src/app/stores/tabMetaStore';
import { createDefaultInitiativeState } from '../../../src/app/types/initiativeTypes';

/** Just enough of pixi-viewport's `Viewport` for the GM camera. */
export class FakeViewport implements CameraViewport {
  center = { x: 500, y: 400 };
  worldScreenWidth = 800;
  worldScreenHeight = 600;
  destroyed = false;
  private readonly listeners = new Set<() => void>();

  on(_event: 'frame-end', listener: () => void): this {
    this.listeners.add(listener);
    return this;
  }

  off(_event: 'frame-end', listener: () => void): this {
    this.listeners.delete(listener);
    return this;
  }

  /** One rendered frame: pixi-viewport emits `frame-end` on every tick. */
  frame(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /** Pans to (x, y), then renders a frame. */
  moveTo(x: number, y: number): void {
    this.center = { x, y };
    this.frame();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

export type CameraSceneState = Pick<ViewAtlasState,
  'background' | 'grid' | 'objects' | 'widgetSettings' | 'widgetValues' | 'initiative' | 'initiativeTrackerOpen' | 'isMapLoading' | 'mapLoaded' | 'mapPath'
>;

export function emptySceneState(isMapLoading = false): CameraSceneState {
  return {
    background: 'maps/tavern.png',
    grid: { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
    objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, audios: {} },
    widgetSettings: { widgets: {}, globalVisible: true, position: 'top', scale: 1 },
    widgetValues: {},
    initiative: createDefaultInitiativeState(),
    initiativeTrackerOpen: false,
    isMapLoading,
    // The view holds Tavern's map, as a loaded view of the Tavern tab does.
    mapLoaded: true,
    mapPath: 'maps/tavern.atlasmap',
  };
}

/** A view with two scene tabs (Tavern active) whose renderer has `viewport`. */
export function viewWithViewport(viewport: FakeViewport | null, state: CameraSceneState = emptySceneState()): {
  view: PresentedView; store: StoreApi<CameraSceneState>; tabs: ReturnType<typeof createTabMetaStore>; tavern: string; dungeon: string;
} {
  const tabs = createTabMetaStore();
  const store = createStore<CameraSceneState>(() => state);
  const tavern = tabs.getState().addTab('maps/tavern.atlasmap', 'Tavern');
  const dungeon = tabs.getState().addTab('maps/dungeon.atlasmap', 'Dungeon');
  tabs.getState().setActiveTab(tavern);
  const view = {
    tabMetaStore: tabs,
    atlasStore: store as unknown as StoreApi<ViewAtlasState>,
    register: () => {},
    renderer: { getBackgroundSprite: () => ({ width: 2000, height: 1500, destroyed: false }), getViewportInstance: () => viewport },
  } as unknown as PresentedView;
  return { view, store, tabs, tavern, dungeon };
}
