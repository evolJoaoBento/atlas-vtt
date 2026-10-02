/**
 * The join page's dice log: everyone's rolls, newest first, at most 50. A replay (sent on every
 * admission) replaces the log and toasts nothing. A new roll is added once, by id, and shows as a
 * toast for 7 s while the log is closed. Shared with the web page; the DOM is
 * `online-client/diceLogView.mts`.
 */
import { DICE_LIMITS, type DiceLogEntry } from '../tools/toolMessages';

/** How long a roll's toast shows: Atlas's toast time. */
export const DICE_TOAST_MS = 7000;

export interface PlayerDiceLogOptions {
  onChange(): void;
}

/**
 * A dice log after `entries` arrived: a replay replaces it; new rolls go first, each once by id,
 * at most 50. `list` is the same array when nothing was new; `newest` is the newest new roll.
 */
export function mergeDiceLog(
  list: readonly DiceLogEntry[],
  entries: readonly DiceLogEntry[],
  replay: boolean,
): { list: readonly DiceLogEntry[]; newest: DiceLogEntry | null } {
  if (replay) return { list: entries.slice(0, DICE_LIMITS.logEntries), newest: null };
  const known = new Set(list.map((entry) => entry.id));
  const fresh = entries.filter((entry) => !known.has(entry.id));
  const newest = fresh[0] ?? null;
  if (!newest) return { list, newest: null };
  return { list: [...fresh, ...list].slice(0, DICE_LIMITS.logEntries), newest };
}

export class PlayerDiceLog {
  private list: readonly DiceLogEntry[] = [];
  private latest: DiceLogEntry | null = null;
  private toastTimer: number | null = null;
  private open = false;

  constructor(private readonly options: PlayerDiceLogOptions) {}

  /** A new array on every change. */
  get entries(): readonly DiceLogEntry[] {
    return this.list;
  }

  /** The roll the toast shows; null while none does. */
  get toast(): DiceLogEntry | null {
    return this.latest;
  }

  get isOpen(): boolean {
    return this.open;
  }

  receive(entries: readonly DiceLogEntry[], replay: boolean): void {
    const merged = mergeDiceLog(this.list, entries, replay);
    if (merged.list === this.list) return;
    this.list = merged.list;
    if (merged.newest && !this.open) this.showToast(merged.newest);
    this.options.onChange();
  }

  setOpen(open: boolean): void {
    this.open = open;
    if (open) this.hideToast();
    this.options.onChange();
  }

  dispose(): void {
    this.hideToast();
  }

  private showToast(entry: DiceLogEntry): void {
    this.hideToast();
    this.latest = entry;
    this.toastTimer = window.setTimeout(() => {
      this.toastTimer = null;
      this.latest = null;
      this.options.onChange();
    }, DICE_TOAST_MS);
  }

  private hideToast(): void {
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = null;
    this.latest = null;
  }
}

/** A die at its highest face is 'max' and at 1 'min', as Atlas's log marks them. */
export function dieExtreme(die: { die: string; value: number }): 'max' | 'min' | null {
  if (die.value === Number(die.die.slice(1))) return 'max';
  return die.value === 1 ? 'min' : null;
}
