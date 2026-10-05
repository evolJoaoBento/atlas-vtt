/**
 * Rolls decided elsewhere that a map view throws with its own 3D dice (`RemoteView.throwRoll`,
 * `dice.throw`): which roll ids a view threw already, so each is thrown once, and the channel
 * that hands a roll to a GM map view's dice display. Kept per view store, so a closed view's
 * memory goes with its store and no map file can ever carry it.
 */
import type { DiceRollResult } from '../tools/diceRolling';
import type { DiceDisplay } from './diceDisplay';
import type { DiceScene } from './diceScene';
import { diceSceneToShow } from './rollPresentation';

/** How many thrown roll ids a view remembers, so a roll handed again is not thrown again. */
export const THROWN_IDS = 100;

type GivenThrowListener = (roll: DiceRollResult) => void;

interface ViewThrows { readonly ids: string[]; readonly listeners: Set<GivenThrowListener> }

const byStore = new WeakMap<object, ViewThrows>();

function throwsOf(store: object): ViewThrows {
  let entry = byStore.get(store);
  if (!entry) {
    entry = { ids: [], listeners: new Set() };
    byStore.set(store, entry);
  }
  return entry;
}

/** Notes that the view of `store` throws roll `id`; false when it threw that id before (of its last 100). */
export function firstThrow(store: object, id: string): boolean {
  const { ids } = throwsOf(store);
  if (ids.includes(id)) return false;
  ids.push(id);
  if (ids.length > THROWN_IDS) ids.shift();
  return true;
}

/** Hands `roll` to the dice display of the GM map view of `store`; nothing happens while none listens. */
export function sendGivenThrow(store: object, roll: DiceRollResult): void {
  for (const listener of [...throwsOf(store).listeners]) listener(roll);
}

/** Hears the rolls `sendGivenThrow` hands to the view of `store`; returns the unsubscribe. */
export function onGivenThrow(store: object, listener: GivenThrowListener): () => void {
  const { listeners } = throwsOf(store);
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The stage a given roll is thrown on, or null for a result card: cards are chosen, or the roll does not list all its dice. */
export function givenRollScene(roll: DiceRollResult, display: DiceDisplay): DiceScene | null {
  return roll.unlistedDice ? null : diceSceneToShow(roll, display);
}
