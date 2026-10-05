/**
 * Why a roll from the Online scene did not go, in the words the dice tray and the dice log show:
 * the session's state says whether the player waits, reconnects or is out, so "check your
 * connection" is said only when the player is in and the link still failed.
 */
import type { PlayerSessionState } from '../PlayerSession';
import type { DiceSelection } from '../../tools/diceRolling';
import { DICE_LIMITS } from '../tools/toolMessages';
import type { OnlineSceneControls } from './remoteScene';
import { t } from '../../i18n';

export const ROLL_NOT_SENT_TEXT = t('online.roll.notSent');
export const ROLL_WAITING_TEXT = t('online.roll.waiting');
export const ROLL_RECONNECTING_TEXT = t('online.roll.reconnecting');
export const ROLL_CONNECTION_LOST_TEXT = t('online.roll.connectionLost');
export const ROLL_SESSION_ENDED_TEXT = t('online.roll.sessionEnded');
export const ROLL_NOT_ATTACHED_TEXT = t('online.roll.notAttached');
export const ROLL_DICE_COUNT_TEXT = t('online.roll.diceCount', { max: String(DICE_LIMITS.dicePerRoll) });

/** Why the session refused a roll, from its state at that moment. */
export function rollRefusal(state: PlayerSessionState | null): string {
  switch (state?.status) {
    case 'admitted':
      return ROLL_NOT_SENT_TEXT;
    case 'waiting':
      return ROLL_WAITING_TEXT;
    case 'connecting':
      return ROLL_RECONNECTING_TEXT;
    case 'lost':
      return state.reason === 'connection-lost' || state.reason === 'unreachable' ? ROLL_CONNECTION_LOST_TEXT : ROLL_SESSION_ENDED_TEXT;
    default:
      return ROLL_SESSION_ENDED_TEXT;
  }
}

/** Sends a roll through the Online scene view's controls; null once it went, else why it did not. */
export function sendOnlineRoll(controls: OnlineSceneControls | null, dice: DiceSelection | null, modifier: number): string | null {
  if (!dice) return ROLL_DICE_COUNT_TEXT;
  if (!controls) return ROLL_NOT_ATTACHED_TEXT;
  return controls.rollDice(dice, modifier);
}
