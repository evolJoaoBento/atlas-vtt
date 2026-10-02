/**
 * Moves Atlas's pixi-viewport the way the join page moves its canvas. The shared
 * `CameraController` decides: follow the GM's camera, gliding there; or stay where the player
 * panned or zoomed; or fit the map. The viewport's own drag, wheel and pinch plugins move it, and
 * their `moved` events tell the controller the player broke away. Moves made here (`setZoom`, then
 * `moveCenter`) emit no `moved` event. Nothing is drawn after a break-away, so a drag in progress
 * is never reset under the player.
 */
import type { SceneCamera } from '../scene/sceneCamera';
import type { PlayerScene } from '../scene/sceneTypes';
import type { Camera } from '../view/camera';
import { CameraController } from '../view/CameraController';

/** The `moved` events pixi-viewport emits for the player's own moves. */
export const PLAYER_MOVES: ReadonlySet<string> = new Set(['drag', 'wheel', 'pinch', 'decelerate']);

/** The part of pixi-viewport's `Viewport` the follower uses. */
export interface FollowViewport {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly center: { x: number; y: number };
  readonly scale: { x: number };
  setZoom(scale: number): unknown;
  moveCenter(x: number, y: number): unknown;
  on(event: 'moved', listener: (event: { type: string }) => void): unknown;
  off(event: 'moved', listener: (event: { type: string }) => void): unknown;
}

export interface Frames {
  request(draw: () => void): number;
  cancel(handle: number): void;
}

export const ANIMATION_FRAMES: Frames = {
  request: (draw) => window.requestAnimationFrame(() => draw()),
  cancel: (handle) => window.cancelAnimationFrame(handle),
};

export interface ViewportFollowerOptions {
  viewport: FollowViewport;
  /** Following started or stopped: Follow GM and Fit map show while it does not. */
  onFollowingChange(following: boolean): void;
  /** Tests pass their own clock and frames. */
  now?: () => number;
  frames?: Frames;
}

export class ViewportFollower {
  private readonly camera: CameraController;
  private readonly frames: Frames;
  private frame: number | null = null;
  private following = true;
  private disposed = false;

  constructor(private readonly options: ViewportFollowerOptions) {
    this.frames = options.frames ?? ANIMATION_FRAMES;
    this.camera = new CameraController({ now: options.now ?? ((): number => performance.now()), onChange: () => this.changed() });
    options.viewport.on('moved', this.onMoved);
    this.resize();
  }

  setScene(scene: PlayerScene | null): void {
    this.camera.setScene(scene);
  }

  setGmCamera(camera: SceneCamera | null): void {
    this.camera.setGmCamera(camera);
  }

  /** The view changed size: a follower refits, a player who broke away keeps their centre. */
  resize(): void {
    const { screenWidth: width, screenHeight: height } = this.options.viewport;
    this.camera.setScreen({ width, height });
  }

  followGm(): void {
    this.camera.followGm();
  }

  fitMap(): void {
    this.camera.fitMap();
  }

  /** Something else moved the viewport (the map image loading re-centres it): put the camera back. */
  reapply(): void {
    this.schedule();
  }

  dispose(): void {
    this.disposed = true;
    this.options.viewport.off('moved', this.onMoved);
    if (this.frame !== null) this.frames.cancel(this.frame);
    this.frame = null;
  }

  private readonly onMoved = (event: { type: string }): void => {
    if (this.disposed || !PLAYER_MOVES.has(event.type)) return;
    const { viewport } = this.options;
    this.camera.movedByPlayer({ centerX: viewport.center.x, centerY: viewport.center.y, zoom: viewport.scale.x });
  };

  private changed(): void {
    const following = this.camera.isFollowing();
    if (following !== this.following) {
      this.following = following;
      this.options.onFollowingChange(following);
    }
    // A break-away leaves the viewport where the player put it.
    if (following || this.camera.isMoving()) this.schedule();
  }

  private schedule(): void {
    if (this.disposed || this.frame !== null) return;
    this.frame = this.frames.request(() => {
      this.frame = null;
      this.draw();
    });
  }

  private draw(): void {
    if (this.disposed) return;
    this.apply(this.camera.current());
    if (this.camera.isMoving()) this.schedule();
  }

  private apply(camera: Camera): void {
    // setZoom first: moveCenter places the centre with the scale it finds.
    this.options.viewport.setZoom(camera.zoom);
    this.options.viewport.moveCenter(camera.centerX, camera.centerY);
  }
}
