import type { Disposer } from './common';
import type { DiceRollResult } from './records';

export interface DiceRollRequest {
  /** e.g. "2d6+1d20-1"; the tray's selection is turned into this with `diceFormula` from @atlas-vtt/shared/rules. A formula without dice, such as "+3", is added to the rules' default roll. */
  formula: string;
  /** Rolls by the rules of this map's collection (exploding dice, critical rule); Atlas's defaults otherwise. */
  mapPath?: string | null;
  /** Someone other than the GM: shown in the log and toasts, shown as a result card rather than thrown on the GM's map, never saved in the map file. */
  rolledBy?: string;
}

export interface DiceApi {
  /** Rolls and logs the roll; returns a frozen copy of the result. */
  roll(request: DiceRollRequest): DiceRollResult;
  /** Every roll Atlas logs: the dice tray, statblocks, `roll`, `publish`. Listeners receive frozen copies and run guarded. */
  onRolled(listener: (result: DiceRollResult) => void): Disposer;
  /** Adds a roll made elsewhere (another Atlas, physical dice) to the log, toasts and sounds. Throws when `result` is not a roll. */
  publish(result: DiceRollResult): void;
}
