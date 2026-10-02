/**
 * The shared dice log in Atlas's dice log panel: each entry as one of Atlas's rolls, under the
 * roller's name. These rolls live only in the online scene's store, which is never saved, and
 * never go through Atlas's document-wide dice event, which every open map would record.
 */
import { isDieType, type DiceRollResult, type DiceSelection } from '../../tools/diceRolling';
import { DICE_LIMITS, isDiceModifier, type DiceLogEntry } from '../tools/toolMessages';

export function diceLogResults(entries: readonly DiceLogEntry[]): DiceRollResult[] {
  return entries.map((entry) => ({
    id: entry.id,
    timestamp: entry.at,
    formula: entry.formula,
    rolls: entry.dice.map(({ die, value }) => ({ die, value, max: Number(die.slice(1)) })),
    modifiers: entry.modifier,
    total: entry.total,
    rolledBy: entry.name,
  }));
}

/** The dice and modifier a logged roll used, to send it again; null when the tray cannot roll it (another die, too many dice). */
export function rollOfResult(result: DiceRollResult): { dice: DiceSelection; modifier: number } | null {
  const dice: DiceSelection = {};
  for (const roll of result.rolls) {
    if (!isDieType(roll.die)) return null;
    dice[roll.die] = (dice[roll.die] ?? 0) + 1;
  }
  const count = result.rolls.length;
  if (count === 0 || count > DICE_LIMITS.dicePerRoll || !isDiceModifier(result.modifiers)) return null;
  return { dice, modifier: result.modifiers };
}

/** The tray's picks as a roll's dice: Atlas's tray dice with a count above zero; null when empty or above the GM's limit. */
export function traySelection(selection: Readonly<Record<string, number>>): DiceSelection | null {
  const dice: DiceSelection = {};
  let total = 0;
  for (const [die, count] of Object.entries(selection)) {
    if (!isDieType(die) || count <= 0) continue;
    dice[die] = count;
    total += count;
  }
  return total >= 1 && total <= DICE_LIMITS.dicePerRoll ? dice : null;
}
