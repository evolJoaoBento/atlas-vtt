/**
 * The handle an extension holds on one remote map view (`RemoteView`): it owns the view, takes
 * what the extension feeds and tells it what the player did. Every listener runs guarded, and
 * everything is let go once the view closes, whoever closed it.
 */
import type { WorkspaceLeaf } from 'obsidian';
import type { RemoteView } from '../../api/types/remoteViews';
import type { Disposer } from '../../api/types/common';
import type { RemoteMapView } from './RemoteMapView';
import type { RemoteViewOwner } from './remoteOwners';

/** An extension's callback must never throw into Atlas's store, pointer handling or frame loop. */
export function callGuarded<A extends unknown[], R>(what: string, listener: (...args: A) => R, ...args: A): R | undefined {
  try {
    return listener(...args);
  } catch (error) {
    console.error(`[Atlas API] A remote view ${what} listener failed:`, error);
    return undefined;
  }
}

/** Listeners that are dropped all at once when the view closes. */
export class ListenerSet<L> {
  private readonly listeners = new Set<L>();
  private closed = false;

  add(listener: L): Disposer {
    if (this.closed || typeof listener !== 'function') return () => undefined;
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  list(): L[] {
    return [...this.listeners];
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }
}

export class RemoteViewHandle implements RemoteViewOwner {
  readonly ready: Promise<boolean>;
  private view: RemoteMapView | null = null;
  private done = false;
  private settle: (opened: boolean) => void = () => undefined;
  private readonly closeListeners = new ListenerSet<() => void>();
  private facade: RemoteView | null = null;

  constructor(readonly owner: string, readonly title: string, readonly icon: string, readonly leaf: WorkspaceLeaf) {
    this.ready = new Promise((resolve) => { this.settle = resolve; });
  }

  get isClosed(): boolean {
    return this.done;
  }

  /** The view this handle owns, once it opened; null before and after. */
  get openView(): RemoteMapView | null {
    return this.done ? null : this.view;
  }

  /** What the extension holds: the handle's methods, frozen. */
  get api(): RemoteView {
    const view = this.view;
    if (!view) throw new Error('The remote view has not opened.');
    this.facade ??= Object.freeze({
      viewId: view.viewId,
      onClose: (listener: () => void): Disposer => this.closeListeners.add(listener),
      close: (): void => this.close(),
    });
    return this.facade;
  }

  opened(view: unknown): void {
    if (this.done) return;
    this.view = view as RemoteMapView;
    this.settle(true);
  }

  closed(): void {
    this.finish();
  }

  resized(): void {
    // Nothing follows the view's size yet.
  }

  close(): void {
    if (this.done) return;
    this.finish();
    this.leaf.detach();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.settle(false);
    const listeners = this.closeListeners.list();
    this.closeListeners.close();
    for (const listener of listeners) callGuarded('close', listener);
  }
}
