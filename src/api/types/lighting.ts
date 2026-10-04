import type { Disposer, ViewId } from './common';

/** How the player window shows a token: seen, outlined only (sensed), or not at all. */
export type Perception = 'seen' | 'sensed' | 'unseen';

export type PlayerVisibility =
  /** Lighting hides nothing: dynamic lighting off, or the scene unlit. */
  | { readonly status: 'unlit' }
  /**
   * Sight is not worked out for the scene the store holds (loading, no bounds yet, graphics context lost), or the
   * explored memory the window shows is still being decoded. Fail closed: show players nothing. `watch` fires when it is ready.
   */
  | { readonly status: 'pending' }
  | {
    readonly status: 'ready';
    /**
     * How the player window perceives each token; a token absent here is 'unseen'. By lighting only: GM-hidden
     * tokens and fog are not applied here, just as `unlit` lists no tokens.
     */
    readonly tokens: Readonly<Record<string, Perception>>;
    /**
     * Where the player window shows the map, cell by cell (1 = shown), explored memory included. Cells are
     * `cellSize` world pixels square from the map's top-left corner, row by row; `shown` is a fresh copy on every call.
     */
    readonly darkness: { readonly cellSize: number; readonly cols: number; readonly rows: number; readonly shown: Uint8Array };
    /** The window shows explored memory where no token sees. */
    readonly showsExplored: boolean;
  };

export interface PlayerVisibilityOptions {
  /** The map's long side holds at most this many cells (16–1024, default 384); cells double in size from 8 px until it does. */
  maxCellsPerSide?: number;
}

export interface LightingApi {
  /**
   * What the GM's player window shows of the view's lit scene, and nothing more. Never throws: an unknown view,
   * or anything Atlas cannot tell yet, is `pending`. Never includes walls, lights, polygons or sight.
   */
  playerVisibility(viewId: ViewId, options?: PlayerVisibilityOptions): PlayerVisibility;
  /**
   * Called when what `playerVisibility` returns may have changed outside the store (sight recomputed, lighting switched,
   * a deferred darkness due, explored memory decoded) and when the scene's lighting or explored memory changes. Runs
   * guarded; ends when the view closes. An unknown view gives a disposer that does nothing.
   */
  watch(viewId: ViewId, listener: () => void): Disposer;
}
