import type { Disposer, ViewId } from './common';

/** The GM's laser reached a point (world units), or was let go. */
export type LocalLaserEvent = { kind: 'point'; x: number; y: number } | { kind: 'lift' };

/** New points of someone else's laser, in their colour. */
export interface RemoteLaser {
  from: string;
  color: string;
  points: ReadonlyArray<{ x: number; y: number }>;
  lifted: boolean;
  /** Milliseconds from each point to the one before it in the stroke, when the sender timed them. */
  dt?: ReadonlyArray<number>;
}

export interface LasersApi {
  /**
   * Hears the GM's own laser in a view: each point of it as it is drawn (world units), and when it is let go.
   * Listeners receive frozen events and run guarded; they end when the view closes. An unknown view, or one
   * without a laser, gives a disposer that does nothing.
   */
  onLocal(viewId: ViewId, listener: (event: LocalLaserEvent) => void): Disposer;
  /**
   * Draws someone else's laser in a view, fading like Atlas's own. Send the newest points as they come:
   * a laser that is not heard from for a second is let go, and lasers are never saved. A message counts
   * its newest 64 points, a gap in time at most 2 seconds, and 32 lasers show at once; the rest is ignored.
   * Does nothing for an unknown view; throws when `laser` is malformed.
   */
  show(viewId: ViewId, laser: RemoteLaser): void;
}
