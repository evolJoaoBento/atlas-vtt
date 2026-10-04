/**
 * One Atlas view's lasers for online play: the GM's own as it is drawn (`LaserPointerRenderer`
 * emits, `LaserRelay` listens), and other people's to show (`LaserRelay` shows,
 * `RemoteLaserRenderer` draws). PIXI-free.
 */

/** The GM's laser reached a point (world units), or was let go. */
export type LocalLaserEvent = { kind: 'point'; x: number; y: number } | { kind: 'lift' };

/** New points of someone else's laser, in their colour. */
export interface RemoteLaser {
  from: string;
  color: string;
  points: ReadonlyArray<{ x: number; y: number }>;
  lifted: boolean;
  /** Milliseconds from each point to the one before it in the stroke, when the sender timed them. */
  dt?: ReadonlyArray<number>;
}

export class LaserHub {
  private readonly local = new Set<(event: LocalLaserEvent) => void>();
  private readonly remote = new Set<(laser: RemoteLaser) => void>();

  onLocal(listener: (event: LocalLaserEvent) => void): () => void {
    this.local.add(listener);
    return () => { this.local.delete(listener); };
  }

  emitLocal(event: LocalLaserEvent): void {
    for (const listener of [...this.local]) listener(event);
  }

  onRemote(listener: (laser: RemoteLaser) => void): () => void {
    this.remote.add(listener);
    return () => { this.remote.delete(listener); };
  }

  showRemote(laser: RemoteLaser): void {
    for (const listener of [...this.remote]) listener(laser);
  }
}
