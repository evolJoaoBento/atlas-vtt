import { snapDroppedToken } from '../app/clipboard/mapObjectPlacement';
import { loadedMapSize } from '../app/services/viewMapSize';
import { runHistoryTransaction } from '../app/stores/history';
import type { TokenEntity } from '../app/types';
import { isLoaded } from './viewInfo';
import type { ViewTracker } from './viewTracker';
import type { Point, ViewId } from './types/common';
import type { TokenMove, TokenMoveOptions, TokenMoveResult, TokensApi } from './types/tokens';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Farthest a position may be from the origin, so no arithmetic on it later can overflow. */
const MAX_COORDINATE = 1e9;

const isCoordinate = (value: unknown): value is number => isFiniteNumber(value) && Math.abs(value) <= MAX_COORDINATE;

const frozenPoint = ({ x, y }: Point): Readonly<Point> => Object.freeze({ x, y });

/** The size the drag snaps by; a malformed size reads as 1, as `size || 1` does for a missing one. */
const footprint = (token: TokenEntity): number => (isFiniteNumber(token.size) && token.size > 0 ? token.size : 1);

const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max);

/** The options with every flag settled; throws on a malformed one. */
function settled(options: unknown): Required<TokenMoveOptions> {
  if (options !== undefined && (typeof options !== 'object' || options === null || Array.isArray(options))) {
    throw new Error('tokens.move: "options" must be an object.');
  }
  const given = (options ?? {}) as Record<string, unknown>;
  const flag = (name: keyof TokenMoveOptions, fallback: boolean): boolean => {
    const value = given[name];
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') throw new Error(`tokens.move: "${name}" must be true or false.`);
    return value;
  };
  return { snap: flag('snap', true), clampToMap: flag('clampToMap', true), allowHidden: flag('allowHidden', false) };
}

/** Each token's last move; an entry that is not an object, or names no token, is kept under a name no token has. */
function lastMoves(moves: unknown): Map<string, Partial<TokenMove>> {
  if (!Array.isArray(moves)) throw new Error('tokens.move: "moves" must be a list of { tokenId, x, y }.');
  const byToken = new Map<string, Partial<TokenMove>>();
  for (const move of moves as unknown[]) {
    const entry = (typeof move === 'object' && move !== null ? move : {}) as Partial<TokenMove>;
    byToken.set(typeof entry.tokenId === 'string' ? entry.tokenId : '', entry);
  }
  return byToken;
}

export function tokensApi(tracker: ViewTracker): TokensApi {
  return Object.freeze({
    snapPoint: (viewId: ViewId, point: Point, tokenSize: number): Readonly<Point> => {
      if (typeof point !== 'object' || point === null || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
        throw new Error('tokens.snapPoint: "point" must be { x, y } numbers.');
      }
      if (!isFiniteNumber(tokenSize) || tokenSize <= 0) throw new Error('tokens.snapPoint: "tokenSize" must be a number above 0.');
      const view = tracker.view(viewId);
      if (!view) return frozenPoint(point);
      return frozenPoint(snapDroppedToken(view.atlasStore.getState().grid, { x: point.x, y: point.y }, tokenSize));
    },
    move: (viewId: ViewId, moves: readonly TokenMove[], options?: TokenMoveOptions): TokenMoveResult => {
      const { snap, clampToMap, allowHidden } = settled(options);
      const wanted = lastMoves(moves);
      const view = tracker.view(viewId);
      if (!view || !isLoaded(view.atlasStore.getState())) return { ok: false, reason: 'not-loaded' };
      const state = view.atlasStore.getState();
      // Own keys only: "constructor" or "__proto__" must never read as a token.
      const known = (id: string): TokenEntity | null => (Object.hasOwn(state.objects.tokens, id) ? (state.objects.tokens[id] ?? null) : null);
      const entries = [...wanted].map(([id, move]) => ({ id, move, token: known(id) }));
      if (entries.some(({ token }) => !token)) return { ok: false, reason: 'unknown-token' };
      if (!allowHidden && entries.some(({ token }) => token?.isHidden)) return { ok: false, reason: 'hidden' };
      const map = loadedMapSize(view);
      const bounded = clampToMap && map.width > 0 && map.height > 0;
      const landings: Array<{ id: string; x: number; y: number }> = [];
      for (const { id, move, token } of entries) {
        if (!token || !isCoordinate(move.x) || !isCoordinate(move.y)) return { ok: false, reason: 'invalid-position' };
        const target = bounded ? { x: clamp(move.x, map.width), y: clamp(move.y, map.height) } : { x: move.x, y: move.y };
        const landed = snap ? snapDroppedToken(state.grid, target, footprint(token)) : target;
        if (!isCoordinate(landed.x) || !isCoordinate(landed.y)) return { ok: false, reason: 'invalid-position' };
        landings.push({ id, x: landed.x, y: landed.y });
      }
      if (landings.length > 0) runHistoryTransaction(view.atlasStore, () => state.setTokenPositions(landings));
      const positions = Object.fromEntries(landings.map(({ id, x, y }) => [id, frozenPoint({ x, y })]));
      return { ok: true, positions: Object.freeze(positions) };
    },
  });
}
