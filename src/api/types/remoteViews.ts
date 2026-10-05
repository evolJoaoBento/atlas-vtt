import type { Disposer, ViewId } from './common';

export interface RemoteStatus {
  title: string;
  connection: string;
  tone: 'connected' | 'pending' | 'ended';
  message: string | null;
  action?: { label: string; run(): void };
}

export interface RemoteViewsApi {
  /** Opens (or reveals, with `reuse`) a tab of type `atlas-vtt-remote`, owned by the calling extension. */
  open(options: { title: string; icon?: string; reuse?: boolean }): Promise<RemoteView>;
}

/**
 * A remote view: read-only, never saved, with no undo history. Every method does nothing once the view closed, and every
 * listener runs guarded and is dropped when the view closes. `views.*` and `lasers.*` take its `viewId`;
 * `views.active()` never returns it, and `tokens.move` and `presentation.present` refuse it.
 */
export interface RemoteView {
  readonly viewId: ViewId;
  /** Called once when the view closes: `close()`, the user closing the tab, the extension or Atlas unloading. */
  onClose(listener: () => void): Disposer;
  close(): void;
}
