import { loadedMapSize } from '../app/services/viewMapSize';
import type { ViewAtlasState } from '../app/storeFactory';
import type { TrackedMapView } from './viewTracker';
import type { SceneSnapshot, ViewInfo } from './types/views';

export function isLoaded(state: Pick<ViewAtlasState, 'mapLoaded' | 'isMapLoading'>): boolean {
  return state.mapLoaded && !state.isMapLoading;
}

export function viewInfo(view: TrackedMapView): ViewInfo {
  const state = view.atlasStore.getState();
  const { tabs, activeTabId } = view.tabMetaStore.getState();
  return {
    viewId: view.viewId,
    kind: 'map',
    activeTabId,
    tabs: tabs.map((tab) => ({ tabId: tab.id, mapPath: tab.filePath, name: tab.displayName })),
    mapPath: state.mapPath,
    loaded: isLoaded(state),
  };
}

/** The store fields a snapshot carries; a change to any of them (by reference) is a new snapshot. */
export function snapshotSlice(state: ViewAtlasState): readonly unknown[] {
  return [
    state.mapPath, state.mapLoaded, state.isMapLoading, state.background, state.grid,
    state.objects.tokens, state.objects.texts, state.objects.drawings, state.objects.fog,
    state.widgetSettings, state.widgetValues, state.initiative, state.initiativeTrackerOpen, state.lighting,
  ];
}

/** The scene in `view`'s store, by reference: the store's frozen Immer records, never copied. */
export function sceneSnapshot(view: TrackedMapView): SceneSnapshot {
  const state = view.atlasStore.getState();
  return Object.freeze({
    viewId: view.viewId,
    mapPath: state.mapPath,
    loaded: isLoaded(state),
    mapSize: loadedMapSize(view),
    background: state.background,
    grid: state.grid,
    objects: Object.freeze({ tokens: state.objects.tokens, texts: state.objects.texts, drawings: state.objects.drawings, fog: state.objects.fog }),
    widgets: Object.freeze({ settings: state.widgetSettings, values: state.widgetValues }),
    initiative: state.initiative,
    initiativeTrackerOpen: state.initiativeTrackerOpen,
    lighting: state.lighting,
  });
}
