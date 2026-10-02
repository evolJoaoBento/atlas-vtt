/** The GM session's limits, and what its handlers and its owner see. */
import type { ControlMessage } from './protocol';

export const SESSION_LIMITS = {
  joinTimeoutMs: 10_000,
  requestTimeoutMs: 120_000,
  pingIntervalMs: 5_000,
  pingTimeoutMs: 15_000,
  maxPlayers: 12,
  maxPendingRequests: 12,
  maxInvalidMessages: 3,
} as const;

export type PlayerStatus = 'pending' | 'admitted' | 'gone';

export interface SessionPlayer {
  playerId: string;
  name: string;
  status: PlayerStatus;
  /** Set for a player who joined from Atlas in Obsidian; absent for the web page. */
  client?: 'obsidian';
}

export interface SessionHandler {
  onAdmitted?(player: SessionPlayer): void;
  onMessage?(player: SessionPlayer, message: ControlMessage): void;
  /** Anything an admitted player sends on the assets channel, undecoded. */
  onAssetData?(player: SessionPlayer, data: unknown): void;
  onGone?(player: SessionPlayer): void;
}

export interface GmSessionOptions {
  title: string;
  /** A new player is waiting; answer with `allow` or `deny`. */
  onJoinRequest(player: SessionPlayer): void;
  /** A request is no longer open: answered, expired, withdrawn or the session stopped. */
  onRequestClosed(playerId: string): void;
  onPlayersChanged(players: SessionPlayer[]): void;
}
