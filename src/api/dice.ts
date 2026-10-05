import type { App } from 'obsidian';
import { landsOnAFace } from '../app/dice3d/diceScene';
import { mapDiceRules } from '../app/services/mapDiceRules';
import { DICE_ROLLED_EVENT, rollByRules, type DiceRollResult } from '../app/tools/diceRolling';
import { isDiceRollResult, plainCopy } from './diceRollCheck';
import { throwGivenRoll } from './diceThrow';
import type { DisposerSet } from './disposers';
import { frozenCopy } from './frozen';
import type { Disposer, ViewId } from './types/common';
import type { ViewTracker } from './viewTracker';
import type { DiceApi, DiceRollRequest } from './types/dice';

const isString = (value: unknown): value is string => typeof value === 'string';

function assertRequest(request: unknown): asserts request is DiceRollRequest {
  const given = request as Partial<DiceRollRequest> | null;
  const valid = typeof given === 'object' && given !== null && isString(given.formula)
    && (given.mapPath === undefined || given.mapPath === null || isString(given.mapPath))
    && (given.rolledBy === undefined || isString(given.rolledBy));
  if (!valid) throw new Error('[Atlas API] dice.roll: the request must be { formula: string, mapPath?: string | null, rolledBy?: string }.');
}

/**
 * `views` finds the map views `throw` throws in (none without it). `doc` is the document whose `atlas-dice-rolled`
 * event carries Atlas's rolls; the main window's by default.
 */
export function diceApi(app: App, disposers: DisposerSet, views: ViewTracker | null = null, doc: Document = document): DiceApi {
  const dispatch = (result: DiceRollResult): void => {
    doc.dispatchEvent(new CustomEvent(DICE_ROLLED_EVENT, { detail: result }));
  };
  return Object.freeze({
    roll: (request: DiceRollRequest): DiceRollResult => {
      assertRequest(request);
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
      // Copied first and the copy checked, so nothing the caller changes afterwards gets past the check.
      const copy = plainCopy(result);
      if (copy === null) throw new Error('[Atlas API] dice.publish: the roll must be plain data.');
      if (!isDiceRollResult(copy)) throw new Error('[Atlas API] dice.publish: the roll must be { id, timestamp, formula, rolls, modifiers, total }.');
      dispatch(copy);
    },
    throw: (viewId: ViewId, roll: DiceRollResult): boolean => {
      const copy = plainCopy(roll);
      return copy !== null && isDiceRollResult(copy) && copy.rolls.every(landsOnAFace) && throwGivenRoll(app, views, viewId, copy);
    },
  });
}
