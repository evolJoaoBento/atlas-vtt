/**
 * A remote view's dice: the shared log its owner feeds (shown in Atlas's dice log, never saved
 * and never sent through Atlas's document-wide dice event), the player's own rolls it throws, and
 * the rolls the player asks for from the dice tray or Roll again, which go to the owner's
 * `onRoll` listeners. The status bar's status lives here too: it is the owner's text.
 */
import { frozenCopy } from '../../api/frozen';
import type { RemoteStatus } from '../../api/types/remoteViews';
import type { ViewAtlasStore } from '../storeFactory';
import { isDieType, type DiceRollResult } from '../tools/diceRolling';
import { callGuarded, ListenerSet } from './listeners';
import { ROLL_NOT_SENT } from './remoteControls';
import { updateRemoteView } from './remoteViewState';

/** The most dice the remote view's tray lets the player pick for one roll. */
export const REMOTE_MAX_DICE = 100;
/** The most entries of the shared log the dice log shows. */
export const REMOTE_LOG_ENTRIES = 100;
export const ROLL_DICE_COUNT = `Roll 1 to ${REMOTE_MAX_DICE} dice.`;

export type RollListener = (dice: Readonly<Record<string, number>>, modifier: number) => string | null;

/** The dice and modifier a logged roll used, to roll it again; null when the tray could not roll it. */
export function rollOfResult(result: DiceRollResult): { dice: Record<string, number>; modifier: number } | null {
  if (result.unlistedDice) return null;
  const dice: Record<string, number> = {};
  let count = 0;
  for (const roll of result.rolls) {
    // Dice an explosion rolled are not the roll's own: the rules roll them again.
    if (roll.exploded) continue;
    if (!isDieType(roll.die) || roll.negative) return null;
    dice[roll.die] = (dice[roll.die] ?? 0) + 1;
    count++;
  }
  if (count === 0 || count > REMOTE_MAX_DICE || !Number.isSafeInteger(result.modifiers)) return null;
  return { dice, modifier: result.modifiers };
}

function isRoll(value: unknown): value is DiceRollResult {
  const roll = value as Partial<DiceRollResult> | null;
  return typeof roll === 'object' && roll !== null && typeof roll.id === 'string' && typeof roll.formula === 'string'
    && Array.isArray(roll.rolls) && typeof roll.total === 'number' && typeof roll.timestamp === 'number';
}

function checkedStatus(status: unknown): RemoteStatus {
  const given = (status ?? {}) as Partial<RemoteStatus>;
  const text = (value: unknown): value is string => typeof value === 'string';
  const tones: readonly unknown[] = ['connected', 'pending', 'ended'];
  const action = given.action;
  const valid = text(given.title) && text(given.connection) && tones.includes(given.tone) && (given.message === null || text(given.message))
    && (action === undefined || (text(action.label) && typeof action.run === 'function'));
  if (!valid) throw new Error('RemoteView.setStatus: the status must be a RemoteStatus.');
  const run = action?.run.bind(action);
  return Object.freeze({
    title: given.title, connection: given.connection, tone: given.tone as RemoteStatus['tone'], message: given.message,
    ...(action && run ? { action: Object.freeze({ label: action.label, run: (): void => { callGuarded('status action', run); } }) } : {}),
  }) as RemoteStatus;
}

export class RemoteViewDice {
  readonly rolls = new ListenerSet<RollListener>();

  constructor(private readonly store: ViewAtlasStore) {}

  setStatus(status: unknown): void {
    updateRemoteView(this.store, { status: checkedStatus(status) });
  }

  setDiceLog(entries: unknown): void {
    if (!Array.isArray(entries) || !entries.every(isRoll)) throw new Error('RemoteView.setDiceLog: the entries must be dice roll results.');
    updateRemoteView(this.store, { diceLog: frozenCopy(entries.slice(0, REMOTE_LOG_ENTRIES)) });
  }

  /** Throws `result` once: the same id again, the roll on screen, is ignored. */
  throwRoll(result: unknown): void {
    if (!isRoll(result)) throw new Error('RemoteView.throwRoll: the result must be a dice roll result.');
    if (this.store.getState().remoteView?.ownRoll?.id === result.id) return;
    updateRemoteView(this.store, { ownRoll: frozenCopy(result) });
  }

  /** Asks the listeners in turn until one sends the roll; null once sent, else the first reason given. */
  roll(dice: Readonly<Record<string, number>>, modifier: number): string | null {
    const picked: Record<string, number> = {};
    let total = 0;
    for (const [die, count] of Object.entries(dice)) {
      if (!isDieType(die) || !Number.isSafeInteger(count) || count <= 0) continue;
      picked[die] = count;
      total += count;
    }
    if (total < 1 || total > REMOTE_MAX_DICE) return ROLL_DICE_COUNT;
    const selection = Object.freeze(picked);
    const sent = Number.isSafeInteger(modifier) ? modifier : 0;
    let reason: string | null = null;
    for (const listener of this.rolls.list()) {
      const answer = callGuarded('roll', listener, selection, sent);
      if (answer === null) return null;
      reason ??= typeof answer === 'string' && answer !== '' ? answer : ROLL_NOT_SENT;
    }
    return reason ?? ROLL_NOT_SENT;
  }

  dispose(): void {
    this.rolls.close();
  }
}
