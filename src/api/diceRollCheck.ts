import type { DiceRollResult } from '../app/tools/diceRolling';

/** The most dice one roll result may list; more is no roll anyone made. */
export const MAX_ROLL_DICE = 1000;

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function isDie(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const die = value as Record<string, unknown>;
  return isString(die.die) && isNumber(die.value) && isNumber(die.max)
    && (die.negative === undefined || typeof die.negative === 'boolean')
    && (die.exploded === undefined || typeof die.exploded === 'boolean');
}

/** Whether `value` is a well-formed roll result. Check a copy (`plainCopy`), so nothing changes after the check. */
export function isDiceRollResult(value: unknown): value is DiceRollResult {
  if (typeof value !== 'object' || value === null) return false;
  const roll = value as Record<string, unknown>;
  return isString(roll.id) && isString(roll.formula) && isNumber(roll.timestamp) && isNumber(roll.total) && isNumber(roll.modifiers)
    && Array.isArray(roll.rolls) && roll.rolls.length <= MAX_ROLL_DICE && roll.rolls.every(isDie)
    && (roll.crit === undefined || roll.crit === null || roll.crit === 'high' || roll.crit === 'low')
    && (roll.rolledBy === undefined || isString(roll.rolledBy))
    && (roll.unlistedDice === undefined || isNumber(roll.unlistedDice));
}

/** A deep copy of `value`, read once; null when it holds something that is not plain data (a function, a DOM node). */
export function plainCopy<T>(value: T): T | null {
  try {
    return structuredClone(value);
  } catch {
    return null;
  }
}
