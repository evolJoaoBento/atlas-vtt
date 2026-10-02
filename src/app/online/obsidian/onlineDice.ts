/**
 * The shared dice log in Atlas's dice log panel: each entry as one of Atlas's rolls, under the
 * roller's name. These rolls live only in the online scene's store, which is never saved, and
 * never go through Atlas's document-wide dice event, which every open map would record.
 */
import type { DiceRollResult } from '../../tools/diceRolling';
import type { DiceLogEntry } from '../tools/toolMessages';

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
