import type { App } from 'obsidian';
import { mapDiceRules } from '../app/services/mapDiceRules';
import { DICE_ROLLED_EVENT, rollByRules, type DiceRollResult } from '../app/tools/diceRolling';
import { throwGivenRoll } from './diceThrow';
import type { DisposerSet } from './disposers';
import { frozenCopy } from './frozen';
import type { Disposer, ViewId } from './types/common';
import type { ViewTracker } from './viewTracker';
import type { DiceApi, DiceRollRequest } from './types/dice';

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function isDie(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const die = value as Record<string, unknown>;
  return isString(die.die) && isNumber(die.value) && isNumber(die.max)
    && (die.negative === undefined || typeof die.negative === 'boolean')
    && (die.exploded === undefined || typeof die.exploded === 'boolean');
}

function isRoll(value: unknown): value is DiceRollResult {
  if (typeof value !== 'object' || value === null) return false;
  const roll = value as Record<string, unknown>;
  return isString(roll.id) && isString(roll.formula) && isNumber(roll.timestamp) && isNumber(roll.total) && isNumber(roll.modifiers)
    && Array.isArray(roll.rolls) && roll.rolls.every(isDie)
    && (roll.crit === undefined || roll.crit === null || roll.crit === 'high' || roll.crit === 'low')
    && (roll.rolledBy === undefined || isString(roll.rolledBy))
    && (roll.unlistedDice === undefined || isNumber(roll.unlistedDice));
}

function assertRequest(request: unknown): asserts request is DiceRollRequest {
  const given = request as Partial<DiceRollRequest> | null;
  const valid = typeof given === 'object' && given !== null && isString(given.formula)
    && (given.mapPath === undefined || given.mapPath === null || isString(given.mapPath))
    && (given.rolledBy === undefined || isString(given.rolledBy));
  if (!valid) throw new Error('[Atlas API] roll needs { formula: string, mapPath?: string | null, rolledBy?: string }.');
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
      if (!isRoll(result)) throw new Error('[Atlas API] publish needs a roll: { id, timestamp, formula, rolls, modifiers, total }.');
      let copy: DiceRollResult;
      try {
        copy = structuredClone(result);
      } catch {
        throw new Error('[Atlas API] publish needs a roll made of plain data.');
      }
      dispatch(copy);
    },
    throw: (viewId: ViewId, roll: DiceRollResult): boolean => isRoll(roll) && throwGivenRoll(app, views, viewId, roll),
  });
}
