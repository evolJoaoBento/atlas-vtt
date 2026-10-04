import type { AtlasEvents } from './types/api';

type Listener = (...args: never[]) => void;

/** Fans Atlas's API events out to every connected extension; a failing listener never stops the others. */
export class ApiEvents {
  private readonly listeners = new Map<keyof AtlasEvents, Set<Listener>>();

  on<E extends keyof AtlasEvents>(event: E, listener: AtlasEvents[E]): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const stored = set;
    stored.add(listener);
    return (): void => { stored.delete(listener); };
  }

  emit<E extends keyof AtlasEvents>(event: E, ...args: Parameters<AtlasEvents[E]>): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        (listener as (...values: Parameters<AtlasEvents[E]>) => void)(...args);
      } catch (error) {
        console.error(`[Atlas API] A '${String(event)}' listener failed:`, error);
      }
    }
  }

  get size(): number {
    let count = 0;
    for (const set of this.listeners.values()) count += set.size;
    return count;
  }
}
