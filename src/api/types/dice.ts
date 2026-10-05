import type { Disposer, ViewId } from './common';
import type { DiceRollResult } from './records';

export interface DiceRollRequest {
  /** e.g. "2d6+1d20-1"; the tray's selection is turned into this with `diceFormula` from @atlas-vtt/shared/rules. A formula without dice, such as "+3", is added to the rules' default roll. */
  formula: string;
  /** Rolls by the rules of this map's collection (exploding dice, critical rule); Atlas's defaults otherwise. Rules only: the roll shows in every open map's log. */
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
  /**
   * Throws `roll`, a result decided elsewhere, with Atlas's 3D dice in the map view `viewId` (a GM map view or a remote
   * view), seeded by the roll's id as Atlas's own throws are, in the user's dice look and speed. Each roll id is thrown
   * once per view: handing it again throws nothing and answers true. False when nothing is thrown: the view is not open
   * or its map not loaded, the user shows dice as result cards, or `roll` is not a roll; show the roll your own way then.
   * Where the view cannot draw 3D dice (no WebGL), or the roll does not list all its dice, Atlas shows its result card.
   * It only throws: nothing is logged, `onRolled` hears nothing and the player window shows nothing (`publish` does those).
   */
  throw?(viewId: ViewId, roll: DiceRollResult): boolean;
}
