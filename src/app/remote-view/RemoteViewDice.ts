/**
 * A remote view's dice: the shared log its owner feeds (shown in Atlas's dice log, never saved
 * and never sent through Atlas's document-wide dice event), the player's own rolls it throws, and
 * the rolls the player asks for from the dice tray or Roll again, which go to the owner's
 * `onRoll` listeners. The status bar's status lives here too: it is the owner's text and buttons.
 */
import { frozenCopy } from '../../api/frozen';
import { noteThrown, thrownBefore } from '../dice3d/givenThrows';
import type { RemoteStatus, RemoteStatusAction } from '../../api/types/remoteViews';
import type { ViewAtlasStore } from '../storeFactory';
import { isDieType, type DiceRollResult } from '../tools/diceRolling';
import { callGuarded, ListenerSet } from './listeners';
import { ROLL_NOT_SENT } from './remoteControls';
import { updateRemoteView, type ShownStatus, type ShownStatusAction } from './remoteViewState';
import { t } from '../i18n';

/** The most dice a remote view's tray may offer for one roll (`remoteViews.open({ maxDice })`, its default). */
export const REMOTE_MAX_DICE = 100;
/** The most entries of the shared log the dice log shows. */
export const REMOTE_LOG_ENTRIES = 100;
/** Why a pick of the wrong size is not sent. */
export const rollDiceCount = (maxDice: number): string => t('remote.rollDiceCount', { max: maxDice });

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

/** The most buttons a status may have, `action` and `actions` together, so the status bar keeps them on one row. */
export const REMOTE_STATUS_ACTIONS = 3;

const text = (value: unknown): value is string => typeof value === 'string';
const name = (value: unknown): value is string => text(value) && value !== '';

function isAction(value: unknown): value is RemoteStatusAction {
  const action = value as Partial<RemoteStatusAction> | null;
  return typeof action === 'object' && action !== null && name(action.id) && name(action.label) && (action.icon === undefined || name(action.icon));
}

/** The owner's `actions`, checked and copied (frozen), each telling `choose` its id; throws for a malformed list. */
function checkedActions(actions: unknown, room: number, choose: (id: string) => void): readonly ShownStatusAction[] {
  const valid = Array.isArray(actions) && actions.length <= room && actions.every(isAction)
    && new Set(actions.map((action) => action.id)).size === actions.length;
  if (!valid) {
    throw new Error(`RemoteView.setStatus: "actions" must list { id, label, icon? } with distinct ids and non-empty text, at most ${REMOTE_STATUS_ACTIONS} buttons with "action" (${room} left).`);
  }
  return Object.freeze(actions.map(({ id, label, icon }) => Object.freeze({
    id, label, ...(icon !== undefined ? { icon } : {}), run: (): void => { choose(id); },
  })));
}

function checkedStatus(status: unknown, choose: (id: string) => void): ShownStatus {
  const given = (status ?? {}) as Partial<RemoteStatus>;
  const tones: readonly unknown[] = ['connected', 'pending', 'ended'];
  const action = given.action;
  const valid = text(given.title) && text(given.connection) && tones.includes(given.tone) && (given.message === null || text(given.message))
    && (action === undefined || (text(action.label) && typeof action.run === 'function'));
  if (!valid) throw new Error('RemoteView.setStatus: the status must be a RemoteStatus.');
  const actions = given.actions === undefined ? undefined : checkedActions(given.actions, REMOTE_STATUS_ACTIONS - (action ? 1 : 0), choose);
  const run = action?.run.bind(action);
  return Object.freeze({
    title: given.title, connection: given.connection, tone: given.tone as RemoteStatus['tone'], message: given.message,
    ...(action && run ? { action: Object.freeze({ label: action.label, run: (): void => { callGuarded('status action', run); } }) } : {}),
    ...(actions ? { actions } : {}),
  }) as ShownStatus;
}

export class RemoteViewDice {
  readonly rolls = new ListenerSet<RollListener>();
  /** Told the id of the status action the player chose. */
  readonly statusActions = new ListenerSet<(id: string) => void>();

  constructor(private readonly store: ViewAtlasStore, private readonly maxDice: number = REMOTE_MAX_DICE) {
    updateRemoteView(store, { maxDice });
  }

  setStatus(status: unknown): void {
    updateRemoteView(this.store, { status: checkedStatus(status, (id) => this.chooseAction(id)) });
  }

  setDiceLog(entries: unknown): void {
    if (!Array.isArray(entries) || !entries.every(isRoll)) throw new Error('RemoteView.setDiceLog: the entries must be dice roll results.');
    updateRemoteView(this.store, { diceLog: frozenCopy(entries.slice(0, REMOTE_LOG_ENTRIES)) });
  }

  /** Throws `result` once: an id this view threw before (of the last 100, `dice.throw` included) is ignored. */
  throwRoll(result: unknown): void {
    if (!isRoll(result)) throw new Error('RemoteView.throwRoll: the result must be a dice roll result.');
    if (thrownBefore(this.store, result.id)) return;
    noteThrown(this.store, result.id);
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
    if (total < 1 || total > this.maxDice) return rollDiceCount(this.maxDice);
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
    this.statusActions.close();
  }

  private chooseAction(id: string): void {
    for (const listener of this.statusActions.list()) callGuarded('status action', listener, id);
  }
}
