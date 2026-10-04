export interface PresentationTargetEntry { id: string; label: string; isActive(): boolean }

const targets = new Set<PresentationTargetEntry>();
const listeners = new Set<() => void>();

/** Adds an audience besides the player window; returns the removal (idempotent). */
export function addPresentationTarget(target: PresentationTargetEntry): () => void {
  targets.add(target);
  notify();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    targets.delete(target);
    notify();
  };
}

/** The first active target, which decides what the eye does and says; null when only the player window watches. */
export function activePresentationTarget(): PresentationTargetEntry | null {
  for (const target of targets) {
    try {
      if (target.isActive()) return target;
    } catch (error) {
      console.error('[Atlas] A presentation target failed:', error);
    }
  }
  return null;
}

/** For React (useSyncExternalStore) and `ui.invalidate()`: targets were added, removed, or asked to be re-read. */
export function subscribePresentationTargets(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function invalidatePresentationTargets(): void {
  notify();
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}
