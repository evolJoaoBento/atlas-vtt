import type { Disposer, ViewId } from './common';
import type {
  BackgroundState, DrawingStroke, FogOperation, GridState, InitiativeState, SceneLighting,
  TextElement, TokenEntity, WidgetSettings, WidgetValues,
} from './records';

/** The visible world area of a view: its centre and size in world units. */
export interface ViewCamera {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/** A view as `views.list()`, `views.active()` and the `map-loaded` and `map-closed` events describe it; frozen. */
export interface ViewInfo {
  viewId: ViewId;
  kind: 'map' | 'remote';
  activeTabId: string | null;
  tabs: ReadonlyArray<{ tabId: string; mapPath: string; name: string }>;
  mapPath: string | null;
  /** The store holds `mapPath`'s scene completely: `mapLoaded && !isMapLoading`. */
  loaded: boolean;
}

/**
 * The scene in a view's store, frozen to its depth: records are the store's frozen data passed by reference, or a
 * frozen copy of data the store has not frozen yet (right after a map loads).
 */
export interface SceneSnapshot {
  readonly viewId: ViewId;
  readonly mapPath: string | null;
  readonly loaded: boolean;
  /**
   * The loaded background's size in world pixels; 0 × 0 without one.
   * Read when the snapshot is taken: the background may finish drawing after `loaded`; take a fresh snapshot when you need the size.
   */
  readonly mapSize: { readonly width: number; readonly height: number };
  readonly background: BackgroundState;
  readonly grid: GridState | null;
  readonly objects: {
    readonly tokens: Readonly<Record<string, TokenEntity>>;
    readonly texts: Readonly<Record<string, TextElement>>;
    readonly drawings: Readonly<Record<string, DrawingStroke>>;
    readonly fog: Readonly<Record<string, FogOperation>>;
  };
  readonly widgets: { readonly settings: WidgetSettings; readonly values: WidgetValues };
  readonly initiative: InitiativeState;
  readonly initiativeTrackerOpen: boolean;
  /** The GM's lighting settings: an extension should never send them to players, only decide by them (with `lighting.playerVisibility`). */
  readonly lighting: SceneLighting;
}

export interface ViewsApi {
  list(): ViewInfo[];
  /** The active Atlas map view; never a remote view. */
  active(): ViewInfo | null;
  snapshot(viewId: ViewId): SceneSnapshot | null;
  /** Called after each store change that replaced one of the snapshot's fields (by reference). */
  subscribe(viewId: ViewId, listener: (snapshot: SceneSnapshot) => void): Disposer;
  camera(viewId: ViewId): ViewCamera | null;
  /** Called after every viewport frame (pixi-viewport `frame-end`), so gestures, moves and resizes alike. */
  watchCamera(viewId: ViewId, listener: (camera: ViewCamera) => void): Disposer;
}
