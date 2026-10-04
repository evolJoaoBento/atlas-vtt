/**
 * The players' darkness of one view over time: worked out from the view's own lighting (the
 * sight, light and spots the GM's player window is drawn by, `PlayerLighting`), with the
 * explored memory decoded from the scene's saved mask, and rebuilt at most every interval.
 */
import type { PlayerLighting } from '../../pixi/lighting/playerLightingLayers';
import type { MapSize } from '../../services/viewMapSize';
import { darknessRaster, MAX_DARKNESS_CELLS_PER_SIDE, type DarknessRaster } from './darknessRaster';
import { ExploredImages, type ExploredDecoder } from './exploredImage';

/**
 * The darkness is worked out anew at most this often: whoever sends it to players repaints a fog
 * with each new one, and a drag with live sight would otherwise change it twenty times a second.
 * Every change to it waits, also one that hides more (a light put out, a door closed, the explored
 * memory cleared or switched off): only a view whose sight stops or starts being the scene's
 * darkens or lights at once. A darkness that lags shows, for up to this long, map art the window
 * showed that long ago; never another scene's, since the view's owner restarts it on every load.
 */
export const DARKNESS_INTERVAL_MS = 200;

interface Built {
  inputs: readonly unknown[];
  raster: DarknessRaster;
  at: number;
}

export interface SightFrame {
  raster: DarknessRaster;
  /** The window shows explored memory whose mask is still decoding, with nothing to stand in: the raster is all dark. */
  exploredPending: boolean;
}

/**
 * One view's darkness rasters: memoised by their inputs, throttled to `DARKNESS_INTERVAL_MS`, with
 * the explored memory decoded once per mask. `onDue` is called when the raster should be asked for
 * again: a mask was decoded, or a deferred raster is due.
 */
export class SightFrames {
  private readonly explored: ExploredImages;
  private built: Built | null = null;
  private timer: number | null = null;

  constructor(private readonly onDue: () => void, decode?: ExploredDecoder) {
    this.explored = new ExploredImages(onDue, decode);
  }

  raster(
    lighting: PlayerLighting,
    exploredMask: string | null,
    map: MapSize,
    maxCellsPerSide = MAX_DARKNESS_CELLS_PER_SIDE,
    now = Date.now(),
  ): SightFrame {
    const explored = lighting.showsExplored ? this.explored.of(exploredMask) : null;
    if (lighting.showsExplored && this.explored.pending()) {
      // Not kept: the first raster once the memory is known comes at once.
      return { raster: darknessRaster({ ...lighting, ready: false }, null, map, maxCellsPerSide), exploredPending: true };
    }
    const inputs = [lighting.ready, lighting.sight, lighting.ambient, lighting.reaches, lighting.spots, explored, map.width, map.height, maxCellsPerSide];
    return { raster: this.memo(inputs, now, () => darknessRaster(lighting, explored, map, maxCellsPerSide)), exploredPending: false };
  }

  /** The store holds a scene anew (a map loaded, or reloaded in place): nothing worked out or decoded before stands in. */
  restart(): void {
    this.built = null;
    this.explored.reset();
  }

  dispose(): void {
    this.explored.dispose();
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.built = null;
  }

  /** The raster of `inputs`; while the last one is younger than the interval, it stays and the new one is due later. */
  private memo(inputs: readonly unknown[], now: number, build: () => DarknessRaster): DarknessRaster {
    const last = this.built;
    if (last && inputs.length === last.inputs.length && inputs.every((input, i) => input === last.inputs[i])) return last.raster;
    // A first raster comes at once, and so does the raster of a view whose sight is not the scene's (yet, or any more).
    const wait = last && inputs[0] === true && last.inputs[0] === true ? last.at + DARKNESS_INTERVAL_MS - now : 0;
    if (last && wait > 0) {
      this.timer ??= window.setTimeout(() => {
        this.timer = null;
        this.onDue();
      }, wait);
      return last.raster;
    }
    this.built = { inputs, raster: build(), at: now };
    return this.built.raster;
  }
}
