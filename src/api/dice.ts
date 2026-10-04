import type { App } from 'obsidian';
import { mapDiceRules } from '../app/services/mapDiceRules';
import { DICE_ROLLED_EVENT, rollByRules, type DiceRollResult } from '../app/tools/diceRolling';
import type { DisposerSet } from './disposers';
import { frozenCopy } from './frozen';
import type { Disposer } from './types/common';
import type { DiceApi, DiceRollRequest } from './types/dice';

function isRoll(value: unknown): value is DiceRollResult {
  if (typeof value !== 'object' || value === null) return false;
  const roll = value as Partial<DiceRollResult>;
  return typeof roll.id === 'string' && typeof roll.formula === 'string' && typeof roll.timestamp === 'number'
    && typeof roll.total === 'number' && typeof roll.modifiers === 'number' && Array.isArray(roll.rolls);
}

/** `doc` is the document whose `atlas-dice-rolled` event carries Atlas's rolls; the main window's by default. */
export function diceApi(app: App, disposers: DisposerSet, doc: Document = document): DiceApi {
  const dispatch = (result: DiceRollResult): void => {
    doc.dispatchEvent(new CustomEvent(DICE_ROLLED_EVENT, { detail: result }));
  };
  return Object.freeze({
    roll: (request: DiceRollRequest): DiceRollResult => {
      const rolled = rollByRules(request.formula, mapDiceRules(app, request.mapPath ?? null));
      const result = request.rolledBy ? { ...rolled, rolledBy: request.rolledBy } : rolled;
      dispatch(result);
      return frozenCopy(result);
    },
    onRolled: (listener: (result: DiceRollResult) => void): Disposer => {
      const handler = (event: Event): void => {
        try {
          listener(frozenCopy((event as CustomEvent<DiceRollResult>).detail));
        } catch (error) {
          console.error('[Atlas API] A dice listener failed:', error);
        }
      };
      doc.addEventListener(DICE_ROLLED_EVENT, handler);
      return disposers.add(() => doc.removeEventListener(DICE_ROLLED_EVENT, handler));
    },
    publish: (result: DiceRollResult): void => {
      if (!isRoll(result)) throw new Error('[Atlas API] publish needs a roll: { id, timestamp, formula, rolls, modifiers, total }.');
      dispatch(structuredClone(result));
    },
  });
}
