/**
 * Joins an online session from Atlas: one at a time, never while hosting. It runs the web page's
 * `PlayerSession` (identifying as `obsidian`) and `AssetLoader`, opens the Online scene tab on
 * admission, and hands the scene, camera, token control, dice log and lasers to that tab's view
 * while it is attached. Images stay until the session is left, so the tab keeps the last scene
 * after the session ends and Reconnect still has them. Nothing here reads or writes the vault.
 */
import { Notice, type App } from 'obsidian';
import type { SettingsService } from '../../services/SettingsService';
import type { DiceSelection } from '../../tools/diceRolling';
import { AssetCache, type ImageStore } from '../assets/AssetCache';
import { AssetLoader, type ImageDecoder } from '../assets/AssetLoader';
import type { Hasher } from '../assets/assetIds';
import { openIndexedDbImageStore } from '../assets/indexedDbImageStore';
import { parseJoinLink, type JoinTarget } from '../joinLink';
import { onlineSessionStore } from '../onlineSessionStore';
import { mergeDiceLog, ownRolls } from '../page/diceLogModel';
import type { PlayerSession, PlayerSessionState, PlayerShareHandler } from '../PlayerSession';
import { createJoinSession } from '../preview/joinSession';
import { normalizePlayerName } from '../protocol';
import { DeviceKeys, obsidianLocalStore } from '../sharing/identity/deviceKeys';
import { webIdentityCrypto, type IdentityCrypto } from '../sharing/identity/identityCrypto';
import { JoinIdentity, type SessionIdentity } from '../sharing/identity/JoinIdentity';
import type { SceneCamera } from '../scene/sceneCamera';
import type { PlayerScene, ScenePoint } from '../scene/sceneTypes';
import type { DiceLogEntry } from '../tools/toolMessages';
import { createPeerClient } from '../transport/PeerTransport';
import type { ClientTransport } from '../transport/types';
import { isInSession, joinedSessionStore } from './joinedSessionStore';
import { keyPerHost } from './keyPerHost';
import { JOIN_PROBLEM_TEXT, type JoinProblem, type OnlineSceneSink } from './onlineJoinTypes';
import { decodeToObjectUrls, urlsOf } from './objectUrlImages';
import { openOnlineSceneTab } from './onlineSceneTab';
import type { RemoteImages } from './remoteScene';

export type { SessionIdentity };

export { JOIN_PROBLEM_TEXT, type JoinProblem, type OnlineSceneSink } from './onlineJoinTypes';

export interface OnlineJoinDeps {
  createClient?: (server: JoinTarget['server']) => ClientTransport;
  openStore?: () => Promise<ImageStore | null>;
  decode?: ImageDecoder;
  /** Tests driven by fake timers pass a hash that resolves at once. */
  hash?: Hasher;
  /** Opens the Online scene tab; its view attaches itself. */
  openSceneTab?: () => Promise<void>;
  isHosting?: () => boolean;
  identityCrypto?: IdentityCrypto;
  /** This device's keys per table; Obsidian's local storage unless a test passes its own. */
  deviceKeys?: Pick<DeviceKeys, 'forTable'>;
}

type JoinSettings = Pick<SettingsService, 'getOnlineSettings' | 'setOnlineSettings' | 'onChange'>;

interface Joined {
  target: JoinTarget;
  name: string;
  playerKey: string;
  loader: AssetLoader;
  session: PlayerSession | null;
  /** The tab was opened for this join: a re-admission after Reconnect opens no second one. */
  opened: boolean;
  scene: PlayerScene | null;
  camera: SceneCamera | null;
  control: readonly string[];
  dice: readonly DiceLogEntry[];
  ids: JoinIdentity;
}

export class OnlineJoinService {
  private static readonly instances = new WeakMap<App, OnlineJoinService>();
  static forApp(app: App): OnlineJoinService | undefined {
    return this.instances.get(app);
  }

  private joined: Joined | null = null;
  private sink: OnlineSceneSink | null = null;
  private cache: AssetCache | null = null;
  /** The last "Keep online images" setting seen: other settings changing must not touch the storage. */
  private keepImages: boolean;
  private shareHandler: PlayerShareHandler | null = null;
  private readonly createClient: NonNullable<OnlineJoinDeps['createClient']>;
  private readonly openStore: NonNullable<OnlineJoinDeps['openStore']>;
  private readonly decode: ImageDecoder;
  private readonly hash: Hasher | undefined;
  private readonly openSceneTab: () => Promise<void>;
  private readonly isHosting: () => boolean;
  private readonly stopSettings: () => void;
  private readonly identityCrypto: IdentityCrypto;
  private readonly deviceKeys: Pick<DeviceKeys, 'forTable'>;
  private readonly identityListeners = new Set<(identity: SessionIdentity | null) => void>();

  /** The scene's images by object URL: one URL for the map, another for tokens. */
  readonly images: RemoteImages = {
    background: (assetId) => urlsOf(this.joined?.loader.image(assetId) ?? null)?.background ?? null,
    token: (assetId) => urlsOf(this.joined?.loader.image(assetId) ?? null)?.token ?? null,
  };

  constructor(app: App, private readonly settings: JoinSettings, private readonly clientVersion: string, deps: OnlineJoinDeps = {}) {
    this.createClient = deps.createClient ?? createPeerClient;
    this.openStore = deps.openStore ?? openIndexedDbImageStore;
    this.decode = deps.decode ?? decodeToObjectUrls;
    this.hash = deps.hash;
    this.openSceneTab = deps.openSceneTab ?? ((): Promise<void> => openOnlineSceneTab(app));
    this.isHosting = deps.isHosting ?? ((): boolean => {
      const status = onlineSessionStore.getState().status;
      return status === 'starting' || status === 'hosting';
    });
    this.identityCrypto = deps.identityCrypto ?? webIdentityCrypto;
    this.deviceKeys = deps.deviceKeys ?? new DeviceKeys(obsidianLocalStore(app), this.identityCrypto);
    // Switching keeping off deletes the stored images at once, joined or not.
    this.keepImages = settings.getOnlineSettings().keepImages;
    this.stopSettings = settings.onChange(() => this.keepChanged(this.settings.getOnlineSettings().keepImages));
    OnlineJoinService.instances.set(app, this);
  }

  /** The joined session as the player has it; null while Atlas joins none. */
  get state(): PlayerSessionState | null {
    return this.joined?.session?.state ?? null;
  }

  /** Who this Atlas is in the joined session; null without a joined session or a verified table. */
  get identity(): SessionIdentity | null {
    return this.joined?.ids.identity ?? null;
  }

  onIdentity(listener: (identity: SessionIdentity | null) => void): () => void {
    this.identityListeners.add(listener);
    return () => { this.identityListeners.delete(listener); };
  }

  /** The name to offer in the Join dialog. */
  rememberedName(): string {
    return normalizePlayerName(this.settings.getOnlineSettings().playerName) ?? '';
  }

  /** Starts joining; null once it started, else what stops it. A session that ended is left first. */
  join(link: string, name: string): JoinProblem | null {
    const target = parseJoinLink(link);
    if (!target) return 'link';
    const cleaned = normalizePlayerName(name);
    if (!cleaned) return 'name';
    if (this.isHosting()) return 'hosting';
    if (isInSession(joinedSessionStore.getState())) return 'joined';
    this.leave();
    this.settings.setOnlineSettings({ playerName: cleaned });
    const loader = new AssetLoader({
      cache: this.imageCache(), decode: this.decode, ...(this.hash ? { hash: this.hash } : {}),
      onChange: () => { if (this.joined?.loader === loader) this.sink?.images(); },
    });
    const joined: Joined = {
      target, name: cleaned, playerKey: this.playerKeyFor(target.hostId), loader, session: null,
      opened: false, scene: null, camera: null, control: [], dice: [],
      ids: new JoinIdentity(target, this.identityCrypto, this.deviceKeys),
    };
    this.joined = joined;
    // A link with a table starts once the device proof is made; one without starts at once.
    if (target.tableId) void joined.ids.prepare().then(() => { if (this.joined === joined) this.startSession(joined); });
    else this.startSession(joined);
    return null;
  }

  /** After the connection was lost: joins again with the same key, images and tab. Refused while hosting. */
  reconnect(): JoinProblem | null {
    const joined = this.joined;
    if (!joined || joined.session?.state.status !== 'lost') return null;
    if (this.isHosting()) {
      new Notice(JOIN_PROBLEM_TEXT.hosting);
      return 'hosting';
    }
    this.startSession(joined);
    return null;
  }

  /** Leaves the session: says bye, frees its images and closes its tab. */
  leave(): void {
    const joined = this.joined;
    if (!joined) return;
    this.joined = null;
    if (joined.ids.identity) this.identityListeners.forEach((listener) => listener(null));
    joined.session?.stop();
    joined.loader.dispose();
    this.releaseCache();
    joinedSessionStore.setState({ session: null });
    const sink = this.sink;
    this.sink = null;
    sink?.close();
  }

  /**
   * The Online scene view attaches: it gets what is known so far, then every change. Null without a
   * joined session. Once the sink is set the view is attached, whatever the catch-up does: a step that
   * throws (Atlas's renderer taking the scene) is logged, the others still run, and the view keeps its
   * controls; a throw here would leave it showing the session without them.
   */
  attach(sink: OnlineSceneSink): (() => void) | null {
    const joined = this.joined;
    const session = joined?.session;
    if (!joined || !session) return null;
    this.sink = sink;
    const steps: Array<() => void> = [
      () => sink.session(session.state),
      () => sink.control(joined.control),
      () => sink.diceLog(joined.dice),
      () => sink.scene(joined.scene),
      () => { if (joined.camera) sink.camera(joined.camera); },
      () => sink.images(),
    ];
    for (const step of steps) {
      try {
        step();
      } catch (error) {
        console.error('[Atlas online] The Online scene could not show part of the session:', error);
      }
    }
    return () => {
      if (this.sink === sink) this.sink = null;
    };
  }

  sendTokenMove(tokenId: string, x: number, y: number): boolean {
    return this.joined?.session?.sendTokenMove(tokenId, x, y) ?? false;
  }

  sendDiceRoll(dice: DiceSelection, modifier: number): boolean {
    return this.joined?.session?.sendDiceRoll(dice, modifier) ?? false;
  }

  sendLaser(points: readonly ScenePoint[], lifted: boolean, dt?: readonly number[], color?: string): boolean {
    return this.joined?.session?.sendLaser(points, lifted, dt, color) ?? false;
  }

  /** The plugin unloads. */
  dispose(): void {
    this.leave();
    this.releaseCache();
    this.stopSettings();
  }

  /** One key per GM host for this plugin's lifetime, so the GM recognises a reconnect. Piece 6b replaces it with stable per-table ids. */
  readonly playerKeyFor = keyPerHost();

  /** Sharing's handler for the assets channel of every join from now on (`registerSharing`). */
  useShare(handler: PlayerShareHandler | null): void {
    this.shareHandler = handler;
  }

  /** The images belong to the session: memory is freed and the storage closed when it is left. */
  private releaseCache(): void {
    const cache = this.cache;
    this.cache = null;
    void cache?.dispose();
  }

  private keepChanged(keep: boolean): void {
    if (keep === this.keepImages) return;
    this.keepImages = keep;
    if (this.cache) {
      void this.cache.setKeep(keep);
      return;
    }
    if (keep) return;
    // Nothing joined: a cache that keeps nothing clears the storage as it opens, then lets go of it.
    void new AssetCache({ keep: false, openStore: this.openStore }).dispose();
  }

  private imageCache(): AssetCache {
    this.cache ??= new AssetCache({ keep: this.settings.getOnlineSettings().keepImages, openStore: this.openStore });
    return this.cache;
  }

  private startSession(joined: Joined): void {
    const current = (): boolean => this.joined === joined && joined.session === session;
    const session: PlayerSession = createJoinSession({
      loader: joined.loader,
      hostId: joined.target.hostId,
      name: joined.name,
      playerKey: joined.playerKey,
      clientVersion: this.clientVersion,
      clientKind: 'obsidian',
      ...(this.shareHandler ? { share: this.shareHandler } : {}),
      ...(joined.ids.device ? { device: joined.ids.device } : {}),
      transport: this.createClient(joined.target.server),
      onChange: (state) => { if (current()) this.changed(joined, state); },
      onScene: (scene) => {
        if (!current()) return;
        joined.scene = scene;
        this.sink?.scene(scene);
      },
      onCamera: (camera) => {
        if (!current()) return;
        joined.camera = camera;
        this.sink?.camera(camera);
      },
      onControl: (tokenIds) => {
        if (!current()) return;
        joined.control = tokenIds;
        this.sink?.control(tokenIds);
      },
      onMoveRefused: (tokenId) => { if (current()) this.sink?.moveRefused(tokenId); },
      onDiceLog: (entries, replay) => {
        if (!current()) return;
        const { list, fresh } = mergeDiceLog(joined.dice, entries, replay);
        if (list === joined.dice) return;
        joined.dice = list;
        this.sink?.diceLog(list);
        // Only live rolls are thrown: a replay, or what `attach` hands a view, repeats old ones.
        for (const entry of ownRolls(fresh)) this.sink?.ownRoll(entry);
      },
      onLaser: (laser) => { if (current()) this.sink?.laser(laser); },
    });
    joined.session = session;
    session.start();
  }

  private changed(joined: Joined, state: PlayerSessionState): void {
    joinedSessionStore.setState({ session: state });
    this.sink?.session(state);
    if (state.status === 'admitted') void this.verify(joined);
    if (state.status !== 'admitted' || joined.opened) return;
    joined.opened = true;
    this.openSceneTab().catch((error: unknown) => {
      console.error('[Atlas online] Could not open the online scene:', error);
    });
  }

  /** Takes the identity from the GM's table proof, once per join. */
  private async verify(joined: Joined): Promise<void> {
    if (!(await joined.ids.verify(joined.session?.table ?? null)) || this.joined !== joined) return;
    this.identityListeners.forEach((listener) => listener(joined.ids.identity));
  }
}
