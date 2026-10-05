import type { Disposer } from '../../api/types/common';

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
