/**
 * Applies the drops players send (`token-move`) to the presented scene. A move goes
 * through only when the sender controls the token, it is for the scene players have,
 * that scene is live (not held, not loading: a held view's store shows another map),
 * the token is in the projection (not hidden, not under fog) and the coordinates are
 * finite. The position is clamped to the map (or the scene's content without a map
 * size), snapped as the GM's drag snaps, and written in one undo step. A move that
 * fails a check gets `token-move-refused`; more than `MOVES_PER_SECOND` from one player
 * in a second are ignored. A `GmSession` handler; `GmSession` delivers only admitted
 * players' messages.
 */
import { snapDroppedToken } from '../../clipboard/mapObjectPlacement';
import { runHistoryTransaction } from '../../stores/history';
import type { SessionHandler, SessionPlayer } from '../GmSession';
import { sceneWorldBounds, type PreviewRect } from '../preview/previewLayout';
import type { ControlMessage } from '../protocol';
import { RateLimit } from '../rateLimit';
import type { CameraProjection } from '../scene/CameraSender';
import type { PresentedSceneSource, SceneSession } from '../scene/sceneSources';
import type { ScenePoint } from '../scene/sceneTypes';
import type { TokenControl } from './TokenControl';

export const MOVES_PER_SECOND = 10;

type TokenMove = Extract<ControlMessage, { type: 'token-move' }>;

export interface TokenMoveHandlerOptions {
  session: SceneSession;
  presented: PresentedSceneSource;
  /** The scene players have: moves are checked against it. */
  projection: Pick<CameraProjection, 'currentProjection'>;
  control: TokenControl;
}

/** At most `MOVES_PER_SECOND` moves per player in any one-second window; refused ones count. */
export class MoveRateLimit extends RateLimit {
  constructor() {
    super(MOVES_PER_SECOND);
  }
}

export class TokenMoveHandler implements SessionHandler {
  private readonly limit = new MoveRateLimit();
  private stopSession: (() => void) | null = null;

  constructor(private readonly options: TokenMoveHandlerOptions) {}

  start(): void {
    if (!this.stopSession) this.stopSession = this.options.session.use(this);
  }

  stop(): void {
    this.stopSession?.();
    this.stopSession = null;
  }

  onMessage(player: SessionPlayer, message: ControlMessage): void {
    if (message.type !== 'token-move' || !this.limit.allow(player.playerId, Date.now())) return;
    if (this.apply(player.playerId, message)) return;
    // Only the id the player sent: a refusal says nothing about why, or about other tokens.
    this.options.session.send(player.playerId, { v: 1, type: 'token-move-refused', tokenId: message.tokenId });
  }

  /** Drops the windows of players who left the session: a reconnect must not reset one. */
  retainPlayers(known: ReadonlySet<string>): void {
    this.limit.retain(known);
  }

  /** Whether the move passed every check and was written. */
  private apply(playerId: string, move: TokenMove): boolean {
    const { control, presented, projection } = this.options;
    if (!control.controls(playerId, move.tokenId)) return false;
    const scene = projection.currentProjection();
    const live = presented.current();
    if (!scene || scene.sceneId !== move.sceneId || !live || presented.isHeld()) return false;
    const state = live.store.getState();
    if (state.isMapLoading || !Object.hasOwn(scene.tokens, move.tokenId) || !Object.hasOwn(state.objects.tokens, move.tokenId)) return false;
    // The live token, not only the projection: the broadcaster's last tick can predate a hide.
    if (state.objects.tokens[move.tokenId]?.isHidden) return false;
    if (!Number.isFinite(move.x) || !Number.isFinite(move.y)) return false;
    // The live token's size, as the GM's own drag snaps it.
    const size = state.objects.tokens[move.tokenId]?.size || 1;
    const { x, y } = snapDroppedToken(state.grid, clampTo({ x: move.x, y: move.y }, sceneWorldBounds(scene)), size);
    runHistoryTransaction(live.store, () => live.store.getState().setTokenPositions([{ id: move.tokenId, x, y }]));
    return true;
  }
}

function clampTo(point: ScenePoint, bounds: PreviewRect | null): ScenePoint {
  if (!bounds) return point;
  return {
    x: Math.min(bounds.x + bounds.width, Math.max(bounds.x, point.x)),
    y: Math.min(bounds.y + bounds.height, Math.max(bounds.y, point.y)),
  };
}
