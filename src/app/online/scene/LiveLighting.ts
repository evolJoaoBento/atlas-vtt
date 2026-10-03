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
import { NO_DARKNESS, darknessOf, type Darkness } from './darknessFog';
import { ExploredImages, type ExploredDecoder } from './exploredImage';
import type { MapSize } from './sceneTypes';

/**
 * The darkness is worked out anew at most this often. Each new darkness makes both clients
 * repaint their fog, so a drag with live sight would otherwise repaint it twenty times a
 * second. A darkness that lags shows the map a moment longer where the party saw it a moment
 * ago. Tokens never wait for it: they follow the window's perception at every tick, and only texts
 * and drawings are checked against the darkness (`ProjectionContext.darkCoverage`).
 */
export const DARKNESS_INTERVAL_MS = 200;

export interface LightingFrame {
  /** Whether players see the token, by the player window's own rule; a token they only sense is not seen. */
  seen(tokenId: string): boolean;
  darkness: Darkness;
}

/** The darkness over the map by `lighting`; none without a map size, where the lighting draws nothing. */
export function darknessFor(lighting: PlayerLighting, explored: ExploredImage | null, map: MapSize): Darkness {
  if (!(map.width > 0) || !(map.height > 0)) return NO_DARKNESS;
  return darknessOf(darknessRaster(lighting, explored, map));
}

/** Before the window's sight belongs to the scene nothing is seen: every token is left out and the map is dark. */
export function lightingFrame(lighting: PlayerLighting, darkness: Darkness): LightingFrame {
  const { perception } = lighting;
  return { seen: lighting.ready ? (tokenId) => perception(tokenId) === 'seen' : () => false, darkness };
}

interface Built {
  inputs: readonly unknown[];
  darkness: Darkness;
  at: number;
}

/**
 * The lighting of one presentation: its frame for each projection, the explored memory
 * decoded from the scene's mask, and `onDue` when the projection should run again (the view's
 * sight changed outside the store, a mask was decoded, a deferred darkness is due).
 */
export class LiveLighting {
  private readonly explored: ExploredImages;
  private readonly stopWatching: () => void;
  private built: Built | null = null;
  private timer: number | null = null;

  constructor(private readonly scene: PresentedSceneInfo, private readonly onDue: () => void, decode?: ExploredDecoder) {
    this.explored = new ExploredImages(onDue, decode);
    this.stopWatching = scene.watchLighting?.(onDue) ?? ((): void => {});
  }

  /** Null while the presented scene is unlit, or dynamic lighting is off: the projection is then as without lighting. */
  frame(state: Pick<ViewAtlasState, 'exploredMask'>, map: MapSize, now = Date.now()): LightingFrame | null {
    const lighting = this.scene.lighting?.();
    if (!lighting) {
      this.built = null;
      return null;
    }
    const explored = lighting.showsExplored ? this.explored.of(state.exploredMask) : null;
    const inputs = [lighting.ready, lighting.sight, lighting.ambient, lighting.reaches, lighting.spots, explored, map.width, map.height];
    return lightingFrame(lighting, this.darkness(inputs, now, () => darknessFor(lighting, explored, map)));
  }

  dispose(): void {
    this.stopWatching();
    this.explored.dispose();
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  /** The darkness of `inputs`; while the last one is younger than the interval, it stays and the new one is due later. */
  private darkness(inputs: readonly unknown[], now: number, build: () => Darkness): Darkness {
    const last = this.built;
    if (last && inputs.length === last.inputs.length && inputs.every((input, i) => input === last.inputs[i])) return last.darkness;
    // A first darkness comes at once, and so does the darkness of a view whose sight is not the scene's (yet, or any more).
    const wait = last && inputs[0] === true && last.inputs[0] === true ? last.at + DARKNESS_INTERVAL_MS - now : 0;
    if (last && wait > 0) {
      this.timer ??= window.setTimeout(() => {
        this.timer = null;
        this.onDue();
      }, wait);
      return last.darkness;
    }
    this.built = { inputs, darkness: build(), at: now };
    return this.built.darkness;
  }
}
