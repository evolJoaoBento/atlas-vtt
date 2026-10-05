/**
 * What dynamic lighting hides from online players, read from the presented view's own
 * lighting: the same sight, light and token perception the GM's player window is drawn by
 * (`PlayerLighting`). Nothing of walls, lights or vision is sent; only what they decide: which
 * tokens players see, and the darkness over the map (`darknessFog`).
 */
import type { PlayerLighting } from '../../pixi/lighting/playerLightingLayers';
import type { PresentedSceneInfo } from '../../services/PresentedScene';
import type { ViewAtlasState } from '../../storeFactory';
import { darknessRaster, type ExploredImage } from './darknessRaster';
import { CLOSED_DARKNESS, darknessOf, type Darkness } from './darknessFog';
import type { WorldBounds } from './FogCoverage';
import { ExploredImages, type ExploredDecoder } from './exploredImage';
import type { MapSize } from './sceneTypes';

/**
 * The darkness is worked out anew at most this often. Each new darkness makes both clients
 * repaint their fog, so a drag with live sight would otherwise repaint it twenty times a
 * second. Every change to it waits, also one that hides more (a light put out, a door closed,
 * the explored memory cleared or switched off): only a view whose sight stops or starts being the
 * scene's darkens or lights at once. A darkness that lags shows, for up to this long plus a tick,
 * map art the window showed that long ago, never another scene's. Tokens never wait for it: they follow the window's perception at every tick, and only texts
 * and drawings are checked against the darkness (`ProjectionContext.darkCoverage`).
 */
export const DARKNESS_INTERVAL_MS = 200;

export interface LightingFrame {
  /** Whether players see the token, by the player window's own rule; a token they only sense is not seen. */
  seen(tokenId: string): boolean;
  /** The darkness over the map as it is drawn for players: the fog op, held back for `DARKNESS_INTERVAL_MS`. */
  darkness: Darkness;
  /**
   * Whether texts and drawings may be sent over `bounds` (in the map): shown by the darkness held for the fog op
   * AND by one worked out fresh for this projection, so the stricter of the two decides. The hold never lets
   * them through where the window has just gone dark.
   */
  shown(bounds: WorldBounds): boolean;
}

/** The darkness over the map by `lighting`; closed (nothing shown) without a map size, which cannot be told from a map that is not there yet. */
export function darknessFor(lighting: PlayerLighting, explored: ExploredImage | null, map: MapSize): Darkness {
  if (!(map.width > 0) || !(map.height > 0)) return CLOSED_DARKNESS;
  return darknessOf(darknessRaster(lighting, explored, map));
}

/** Every token left out and the whole map dark: what players get while the view's lighting cannot be read. */
export function closedFrame(map: MapSize): LightingFrame {
  const darkness = map.width > 0 && map.height > 0
    ? darknessOf({ cols: 1, rows: 1, cellSize: Math.max(map.width, map.height), map, dark: Uint8Array.of(1) })
    : CLOSED_DARKNESS;
  return { seen: () => false, darkness, shown: (bounds) => darkness.shown(bounds) };
}

/** Before the window's sight belongs to the scene nothing is seen: every token is left out and the map is dark. */
export function lightingFrame(lighting: PlayerLighting, darkness: Darkness, fresh: Darkness = darkness): LightingFrame {
  const { perception } = lighting;
  return {
    seen: lighting.ready ? (tokenId) => perception(tokenId) === 'seen' : () => false,
    darkness,
    shown: (bounds) => darkness.shown(bounds) && fresh.shown(bounds),
  };
}

interface Built {
  inputs: readonly unknown[];
  darkness: Darkness;
  at: number;
}

const sameInputs = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((input, i) => input === b[i]);

/**
 * The lighting of one presentation: its frame for each projection, the explored memory
 * decoded from the scene's mask, and `onDue` when the projection should run again (the view's
 * sight changed outside the store, a mask was decoded, a deferred darkness is due).
 */
export class LiveLighting {
  private readonly explored: ExploredImages;
  /** Null until the view could be watched: it may have no renderer yet. */
  private stopWatching: (() => void) | null = null;
  private built: Built | null = null;
  /** The darkness of the latest inputs while `built` is held back: what texts and drawings are checked against too. */
  private fresh: { inputs: readonly unknown[]; darkness: Darkness } | null = null;
  /** Whether the last frame had a saved explored mask: one that goes away is a forget, which skips the hold. */
  private hadMask = false;
  private timer: number | null = null;
  /** The store's count of hand edits of the memory the last frame was made at. */
  private edits: number | undefined;

  constructor(private readonly scene: PresentedSceneInfo, private readonly onDue: () => void, decode?: ExploredDecoder) {
    this.explored = new ExploredImages(onDue, decode);
    this.watch();
  }

  /**
   * Null while the view shows the scene unlit, or dynamic lighting is off: the projection is then as
   * without lighting. Where the view cannot tell (no renderer, no lighting state) and the scene is
   * saved lit, nothing is seen (`closedFrame`).
   */
  frame(state: Pick<ViewAtlasState, 'exploredMask' | 'lighting'> & Partial<Pick<ViewAtlasState, 'exploredEdits'>>, map: MapSize, now = Date.now()): LightingFrame | null {
    this.watch();
    // The memory was edited by hand (or undone): no memory decoded before stands in, and the darkness is not held back,
    // so players see less while the new mask decodes, never what was forgotten.
    if (state.exploredEdits !== this.edits) {
      if (this.edits !== undefined) this.restart();
      this.edits = state.exploredEdits;
    }
    // The saved memory is cleared outright (`ExploredMemory.reset` while its texture is not the memory): the same.
    if (state.exploredMask === null && this.hadMask) this.restart();
    this.hadMask = state.exploredMask !== null;
    const lighting = this.scene.lighting?.();
    if (!lighting) {
      this.built = null;
      return lighting === undefined && state.lighting?.enabled ? closedFrame(map) : null;
    }
    const explored = lighting.showsExplored ? this.explored.of(state.exploredMask) : null;
    const inputs = [lighting.ready, lighting.sight, lighting.ambient, lighting.reaches, lighting.spots, explored, map.width, map.height];
    const { held, fresh } = this.darkness(inputs, now, () => darknessFor(lighting, explored, map));
    return lightingFrame(lighting, held, fresh);
  }

  /** The store holds the scene anew (reloaded in place): what was worked out or decoded for it before stands in no more. */
  restart(): void {
    this.built = null;
    this.fresh = null;
    this.explored.reset();
  }

  dispose(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    this.explored.dispose();
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private watch(): void {
    this.stopWatching ??= this.scene.watchLighting?.(this.onDue) ?? null;
  }

  /**
   * The darkness of `inputs` for the fog op, `held`: while the last one is younger than the interval it stays and
   * the new one is due later. And the `fresh` darkness of `inputs`, which is `held` unless that is held back; the
   * check of texts and drawings uses both, so the hold never shows them where the window has just gone dark.
   */
  private darkness(inputs: readonly unknown[], now: number, build: () => Darkness): { held: Darkness; fresh: Darkness } {
    const last = this.built;
    if (last && sameInputs(inputs, last.inputs)) return { held: last.darkness, fresh: last.darkness };
    // A first darkness comes at once, and so does the darkness of a view whose sight is not the scene's (yet, or any
    // more), or of a map whose size changed: a darkness is never held across that.
    const sameMap = !last || (inputs[6] === last.inputs[6] && inputs[7] === last.inputs[7]);
    const wait = last && sameMap && inputs[0] === true && last.inputs[0] === true ? last.at + DARKNESS_INTERVAL_MS - now : 0;
    if (last && wait > 0) {
      this.timer ??= window.setTimeout(() => {
        this.timer = null;
        this.onDue();
      }, wait);
      if (!this.fresh || !sameInputs(inputs, this.fresh.inputs)) this.fresh = { inputs, darkness: build() };
      return { held: last.darkness, fresh: this.fresh.darkness };
    }
    this.fresh = null;
    this.built = { inputs, darkness: build(), at: now };
    return { held: this.built.darkness, fresh: this.built.darkness };
  }
}
