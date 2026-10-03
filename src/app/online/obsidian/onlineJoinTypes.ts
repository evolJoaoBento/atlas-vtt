/** What the Online scene view takes from a joined session, and why a join may not start. */
import type { PlayerSessionState } from '../PlayerSession';
import { INCOMPLETE_LINK_TEXT, NAME_PROBLEM_TEXT } from '../page/pageScreen';
import type { SceneCamera } from '../scene/sceneCamera';
import type { PlayerScene } from '../scene/sceneTypes';
import type { DiceLogEntry, PlayerLaser } from '../tools/toolMessages';

/** What the Online scene view takes from the joined session. */
export interface OnlineSceneSink {
  session(state: PlayerSessionState): void;
  scene(scene: PlayerScene | null): void;
  camera(camera: SceneCamera): void;
  control(tokenIds: readonly string[]): void;
  moveRefused(tokenId: string): void;
  /** The shared dice log, newest first, whole. */
  diceLog(entries: readonly DiceLogEntry[]): void;
  /** A roll this player made just now (`mine`), after the log that lists it: thrown as the player's own dice. */
  ownRoll(entry: DiceLogEntry): void;
  laser(laser: PlayerLaser): void;
  /** Images arrived, failed or went. */
  images(): void;
  /** The session was left from elsewhere (a new join, the plugin unloading): close the tab. */
  close(): void;
}

export type JoinProblem = 'link' | 'name' | 'hosting' | 'joined';

export const JOIN_PROBLEM_TEXT: Record<JoinProblem, string> = {
  link: INCOMPLETE_LINK_TEXT,
  name: NAME_PROBLEM_TEXT,
  hosting: 'Stop hosting your online session before joining another.',
  joined: 'You are already in an online session. Close its tab to leave it first.',
};
