/**
 * The Online scene view's wiring, without PIXI: the joined session's sink. It feeds the remote
 * store (`RemoteSceneApplier`), the camera (`ViewportFollower`), the placeholder background, the
 * initiative panel and the status bar, sends the player's token drops and laser, draws other
 * people's lasers through Atlas's laser hub, and answers the view's controls.
 */
import type { EventEmitter } from 'events';
import type { LaserHub } from '../../pixi/laser/LaserHub';
import type { PlayerOverlay } from '../../services/PlayerSceneOverlay';
import type { ViewAtlasStore } from '../../storeFactory';
import type { PlayerSessionState } from '../PlayerSession';
import type { SceneCamera } from '../scene/sceneCamera';
import type { PlayerScene } from '../scene/sceneTypes';
import { laserColor } from '../tools/laserColors';
import type { DiceLogEntry, PlayerLaser } from '../tools/toolMessages';
import { diceLogResult, diceLogResults } from './onlineDice';
import { OnlineLaserLink } from './OnlineLaserLink';
import type { OnlineJoinService, OnlineSceneSink } from './OnlineJoinService';
import { rollRefusal } from './onlineRollRefusal';
import { onlineSceneStatus } from './onlineSceneStatus';
import { updateRemoteScene, type OnlineSceneControls } from './remoteScene';
import type { RemoteMapBackdrop } from './RemoteMapBackdrop';
import { RemoteSceneApplier } from './RemoteSceneApplier';
import { mayMoveAsOnlinePlayer, ONLINE_DRAG_CANCEL, ONLINE_TOKEN_DROPPED, RemoteTokenMoves, type TokenDrop } from './remoteTokenMoves';
import { ANIMATION_FRAMES, ViewportFollower, type FollowViewport, type Frames } from './ViewportFollower';

export type OnlineSceneService = Pick<OnlineJoinService, 'attach' | 'images' | 'reconnect' | 'sendDiceRoll' | 'sendTokenMove' | 'sendLaser'>;

export interface OnlineSceneClientOptions {
  store: ViewAtlasStore;
  service: OnlineSceneService;
  viewport: FollowViewport;
  backdrop: Pick<RemoteMapBackdrop, 'show' | 'dispose'>;
  /** Atlas's read-only initiative panel, mounted into `parent`. */
  initiative: PlayerOverlay;
  parent: HTMLElement;
  /** The view's event bus: `background-sprite-updated` tells the map image moved the viewport. */
  eventBus: EventEmitter;
  laserHub: Pick<LaserHub, 'showRemote' | 'onLocal'>;
  /** The player's Atlas laser colour, read for every batch sent. */
  laserColor(): string;
  /** The session was left from elsewhere: close the tab. */
  closeTab(): void;
  /** Tests pass their own frames and clock. */
  frames?: Frames;
  now?: () => number;
}

export class OnlineSceneClient implements OnlineSceneSink {
  readonly controls: OnlineSceneControls;
  private readonly applier: RemoteSceneApplier;
  private readonly moves: RemoteTokenMoves;
  private readonly laserLink: OnlineLaserLink;
  private readonly follower: ViewportFollower;
  private readonly frames: Frames;
  private state: PlayerSessionState | null = null;
  private shown: PlayerScene | null = null;
  private detachSession: (() => void) | null = null;
  private imagesFrame: number | null = null;
  private disposed = false;

  constructor(private readonly options: OnlineSceneClientOptions) {
    const { store } = options;
    this.frames = options.frames ?? ANIMATION_FRAMES;
    this.moves = new RemoteTokenMoves({
      store,
      send: (tokenId, x, y) => options.service.sendTokenMove(tokenId, x, y),
      onChange: () => this.applier.refresh(),
    });
    this.applier = new RemoteSceneApplier({ store, images: options.service.images, positionOf: (tokenId) => this.moves.positionOf(tokenId) });
    this.laserLink = new OnlineLaserLink({
      hub: options.laserHub,
      send: (points, lifted, dt, color) => options.service.sendLaser(points, lifted, dt, color),
      color: () => options.laserColor(),
    });
    this.follower = new ViewportFollower({
      viewport: options.viewport,
      onFollowingChange: (following) => updateRemoteScene(store, { following }),
      frames: this.frames,
      ...(options.now ? { now: options.now } : {}),
    });
    this.controls = {
      followGm: () => this.follower.followGm(),
      fitMap: () => this.follower.fitMap(),
      reconnect: () => options.service.reconnect(),
      rollDice: (dice, modifier) => (options.service.sendDiceRoll(dice, modifier) ? null : rollRefusal(this.state)),
    };
    options.initiative.mount(options.parent);
    options.initiative.present(store);
    options.eventBus.on('background-sprite-updated', this.onBackgroundMoved);
    options.eventBus.on(ONLINE_TOKEN_DROPPED, this.onDrop);
  }

  /** Attaches to the joined session; false when there is none. */
  attach(): boolean {
    this.detachSession = this.options.service.attach(this);
    return this.detachSession !== null;
  }

  session(state: PlayerSessionState): void {
    this.state = state;
    this.showStatus();
    this.cancelLostDrag(false);
  }

  scene(scene: PlayerScene | null): void {
    const previous = this.shown;
    this.shown = scene;
    this.cancelLostDrag(previous?.sceneId !== scene?.sceneId);
    this.moves.setScene(scene);
    this.applier.apply(scene);
    this.follower.setScene(scene);
    this.showBackdrop();
    this.showStatus();
  }

  camera(camera: SceneCamera): void {
    this.follower.setGmCamera(camera);
  }

  control(tokenIds: readonly string[]): void {
    updateRemoteScene(this.options.store, { movableTokenIds: [...tokenIds] });
    this.cancelLostDrag(false);
  }

  moveRefused(tokenId: string): void {
    this.moves.refused(tokenId);
  }

  diceLog(entries: readonly DiceLogEntry[]): void {
    this.options.store.setState({ diceLog: diceLogResults(entries) });
  }

  /** The player's own roll: the view's roll display throws it with the player's own Atlas dice settings (`OnlineOwnRolls`). */
  ownRoll(entry: DiceLogEntry): void {
    updateRemoteScene(this.options.store, { ownRoll: diceLogResult(entry) });
  }

  /** Someone else's laser: drawn when it is on the scene this view shows, in its sender's or its place's colour. */
  laser(laser: PlayerLaser): void {
    if (laser.sceneId !== this.shown?.sceneId) return;
    const order = this.state?.players.map((player) => player.playerId) ?? [];
    this.options.laserHub.showRemote({
      from: laser.from,
      color: laser.color ?? laserColor(laser.from, order),
      points: laser.points,
      lifted: laser.lifted,
      ...(laser.dt ? { dt: laser.dt } : {}),
    });
  }

  /** Images arrive chunk by chunk: the store follows at most once a frame. */
  images(): void {
    if (this.disposed || this.imagesFrame !== null) return;
    this.imagesFrame = this.frames.request(() => {
      this.imagesFrame = null;
      if (this.disposed) return;
      this.applier.refresh();
      this.showBackdrop();
    });
  }

  close(): void {
    this.options.closeTab();
  }

  resize(): void {
    this.follower.resize();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachSession?.();
    this.detachSession = null;
    if (this.imagesFrame !== null) this.frames.cancel(this.imagesFrame);
    this.imagesFrame = null;
    this.options.eventBus.off('background-sprite-updated', this.onBackgroundMoved);
    this.options.eventBus.off(ONLINE_TOKEN_DROPPED, this.onDrop);
    this.laserLink.dispose();
    this.moves.dispose();
    this.follower.dispose();
    this.applier.dispose();
    this.options.backdrop.dispose();
    this.options.initiative.destroy();
  }

  private readonly onBackgroundMoved = (): void => {
    this.follower.reapply();
  };

  private readonly onDrop = (drop: TokenDrop): void => {
    if (!this.disposed) this.moves.drop(drop);
  };

  private showBackdrop(): void {
    const { background, grid } = this.options.store.getState();
    this.options.backdrop.show(this.shown, background, grid);
  }

  /** A drag in progress ends, unsent, when a new scene, the GM's control list or the connection took its token away. */
  private cancelLostDrag(sceneChanged: boolean): void {
    const state = this.options.store.getState();
    const lost = sceneChanged || state.selectedIds.some((id) => !mayMoveAsOnlinePlayer(state, id) || !this.shown || !Object.hasOwn(this.shown.tokens, id));
    if (lost) this.options.eventBus.emit(ONLINE_DRAG_CANCEL);
  }

  private showStatus(): void {
    updateRemoteScene(this.options.store, { status: onlineSceneStatus(this.state, this.shown !== null) });
  }
}
