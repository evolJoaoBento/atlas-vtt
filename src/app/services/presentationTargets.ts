import { SlotRegistry, safely } from '../extensions/SlotRegistry';

export interface PresentationTargetEntry { id: string; label: string; isActive(): boolean }

/** Audiences besides the player window, one slot of the extension API like the rest of `extensions/slots.ts`. */
export const presentationTargetSlot = new SlotRegistry<PresentationTargetEntry>();

/** Adds an audience besides the player window for extension `owner`; returns the removal (idempotent). */
export function addPresentationTarget(target: PresentationTargetEntry, owner = 'an extension'): () => void {
  return presentationTargetSlot.add(owner, target);
}

/** The first active target, which decides what the eye does and says; null when only the player window watches. */
export function activePresentationTarget(): PresentationTargetEntry | null {
  for (const { owner, item } of presentationTargetSlot.list()) {
    if (safely(owner, 'presentation target', () => item.isActive(), false)) return item;
  }
  return null;
}

/** For React (useSyncExternalStore) and `ui.invalidate()`: targets were added, removed, or asked to be re-read. */
export function subscribePresentationTargets(listener: () => void): () => void {
  return presentationTargetSlot.subscribe(listener);
}

export function invalidatePresentationTargets(): void {
  presentationTargetSlot.invalidate();
}
