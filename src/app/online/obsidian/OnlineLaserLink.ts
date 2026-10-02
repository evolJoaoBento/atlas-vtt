/**
 * Sends the player's own laser. Atlas's laser in the online scene emits its points on the view's
 * `LaserHub`, and the shared `LaserBatcher` sends them in the join page's batches, in the
 * player's Atlas laser colour. Only the swatches go, as on the join page; for any other colour
 * the GM gives one.
 */
import type { LaserHub } from '../../pixi/laser/LaserHub';
import type { ScenePoint } from '../scene/sceneTypes';
import { LaserBatcher } from '../tools/LaserBatcher';
import { swatchLaserColor } from '../tools/laserColors';

export interface OnlineLaserLinkOptions {
  hub: Pick<LaserHub, 'onLocal'>;
  send(points: ScenePoint[], lifted: boolean, dt: number[], color?: string): boolean;
  /** The player's Atlas laser colour, read for every batch. */
  color(): string;
  /** Tests pass their own clock. */
  clock?: () => number;
}

export class OnlineLaserLink {
  private readonly batcher: LaserBatcher;
  private readonly stopListening: () => void;

  constructor(options: OnlineLaserLinkOptions) {
    this.batcher = new LaserBatcher((points, lifted, dt) => {
      const color = options.color();
      options.send(points, lifted, dt, swatchLaserColor(color) ?? undefined);
    }, options.clock);
    this.stopListening = options.hub.onLocal((event) => {
      if (event.kind === 'point') this.batcher.point({ x: event.x, y: event.y });
      else this.batcher.lift();
    });
  }

  dispose(): void {
    this.stopListening();
    this.batcher.dispose();
  }
}
