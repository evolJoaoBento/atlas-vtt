/**
 * The player's side of moving their own tokens in the Online scene, with Atlas's drag. It says
 * which tokens may be dragged, and holds a dropped token where it was dropped until the GM
 * answers. The answer is an update of that token, a refusal, or `CONFIRM_TIMEOUT_MS` passing.
 * After a refusal it shows "Move not allowed." for `REFUSED_NOTICE_MS`. The rules are the web
 * page's (`online/view/TokenMoves.ts`); Atlas's `InteractionController` does the hit test, the
 * drag and the ruler, and its store is the drag's preview.
 */
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { PlayerScene, PlayerToken, ScenePoint } from '../scene/sceneTypes';
import { CONFIRM_TIMEOUT_MS, MOVE_REFUSED_TEXT, REFUSED_NOTICE_MS } from '../view/TokenMoves';
import { updateRemoteScene } from './remoteScene';

/** What Atlas's `InteractionController` emits on the view's event bus when an online player drops a token. */
export const ONLINE_TOKEN_DROPPED = 'online-token-dropped';

export interface TokenDrop {
  id: string;
  x: number;
  y: number;
}

/** Whether this view lets the player drag `tokenId`: the online scene, admitted, a token the GM gave them. */
export function mayMoveAsOnlinePlayer(state: Pick<ViewAtlasState, 'remoteScene'>, tokenId: string): boolean {
  const remote = state.remoteScene;
  return remote !== null && remote.status.tone === 'connected' && remote.movableTokenIds.includes(tokenId);
}

interface Pending {
  position: ScenePoint;
  /** The token's record at the drop: a different record is the GM's answer. */
  token: PlayerToken | null;
  timer: number;
}

function tokenOf(scene: PlayerScene, tokenId: string): PlayerToken | null {
  return Object.hasOwn(scene.tokens, tokenId) ? scene.tokens[tokenId] ?? null : null;
}

export interface RemoteTokenMovesOptions {
  store: Pick<StoreApi<ViewAtlasState>, 'getState' | 'setState'>;
  /** Sends one drop; false when it could not go. */
  send(tokenId: string, x: number, y: number): boolean;
  /** A position this view shows changed: write the scene again. */
  onChange(): void;
}

export class RemoteTokenMoves {
  private scene: PlayerScene | null = null;
  private readonly pending = new Map<string, Pending>();
  private noticeTimer: number | null = null;

  constructor(private readonly options: RemoteTokenMovesOptions) {}

  /** Where the view shows `tokenId` instead of the GM's position; null for the GM's. */
  positionOf(tokenId: string): ScenePoint | null {
    const state = this.options.store.getState();
    // Mid-drag, the token is where Atlas's drag put it in the store.
    if (state.isDragging && state.selectedIds.includes(tokenId)) {
      const token = state.objects.tokens[tokenId];
      if (token) return { x: token.x, y: token.y };
    }
    return this.pending.get(tokenId)?.position ?? null;
  }

  /** Call before the scene is written: an update of a dropped token is the GM's answer, a new scene drops every hold. */
  setScene(scene: PlayerScene | null): void {
    const previous = this.scene?.sceneId ?? null;
    this.scene = scene;
    if (!scene || scene.sceneId !== previous) {
      this.clearPending();
      return;
    }
    for (const [tokenId, entry] of [...this.pending]) if (tokenOf(scene, tokenId) !== entry.token) this.settle(tokenId);
  }

  /** Atlas dropped a token the player dragged: one `token-move`, and the token waits there for the GM. */
  drop({ id, x, y }: TokenDrop): void {
    const scene = this.scene;
    if (scene && mayMoveAsOnlinePlayer(this.options.store.getState(), id)) {
      this.settle(id);
      // Registered before sending: a refusal delivered at once must find it to settle.
      const timer = window.setTimeout(() => {
        this.settle(id);
        this.options.onChange();
      }, CONFIRM_TIMEOUT_MS);
      this.pending.set(id, { position: { x, y }, token: tokenOf(scene, id), timer });
      if (!this.options.send(id, x, y)) this.settle(id);
    }
    // A drop that did not go goes back to where the scene has the token.
    this.options.onChange();
  }

  /** The GM refused the move: the token goes back, and the notice shows for a while. */
  refused(tokenId: string): void {
    this.settle(tokenId);
    updateRemoteScene(this.options.store, { notice: MOVE_REFUSED_TEXT });
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      this.noticeTimer = null;
      updateRemoteScene(this.options.store, { notice: null });
    }, REFUSED_NOTICE_MS);
    this.options.onChange();
  }

  dispose(): void {
    this.clearPending();
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
  }

  private settle(tokenId: string): void {
    const entry = this.pending.get(tokenId);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    this.pending.delete(tokenId);
  }

  private clearPending(): void {
    for (const tokenId of [...this.pending.keys()]) this.settle(tokenId);
  }
}
