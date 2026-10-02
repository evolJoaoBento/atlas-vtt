/**
 * Joins an online session from Atlas: one at a time, never while hosting. It runs the web page's
 * `PlayerSession` (identifying as `obsidian`) and `AssetLoader`, opens the Online scene tab on
 * admission, and hands the scene, camera, token control, dice log and lasers to that tab's view
 * while it is attached. Images stay until the session is left, so the tab keeps the last scene
 * after the session ends and Reconnect still has them. Nothing here reads or writes the vault.
 */
import type { App } from 'obsidian';
import type { SettingsService } from '../../services/SettingsService';
import type { DiceSelection } from '../../tools/diceRolling';
import { AssetCache, type ImageStore } from '../assets/AssetCache';
import { AssetLoader, type ImageDecoder } from '../assets/AssetLoader';
import type { Hasher } from '../assets/assetIds';
import { openIndexedDbImageStore } from '../assets/indexedDbImageStore';
import { randomId } from '../ids';
import { parseJoinLink, type JoinTarget } from '../joinLink';
import { onlineSessionStore } from '../onlineSessionStore';
import { mergeDiceLog } from '../page/diceLogModel';
import { INCOMPLETE_LINK_TEXT, NAME_PROBLEM_TEXT } from '../page/pageScreen';
import type { PlayerSession, PlayerSessionState } from '../PlayerSession';
import { createJoinSession } from '../preview/joinSession';
import { normalizePlayerName } from '../protocol';
import type { SceneCamera } from '../scene/sceneCamera';
import type { PlayerScene, ScenePoint } from '../scene/sceneTypes';
import type { DiceLogEntry, PlayerLaser } from '../tools/toolMessages';
import { createPeerClient } from '../transport/PeerTransport';
import type { ClientTransport } from '../transport/types';
import { isInSession, joinedSessionStore } from './joinedSessionStore';
import { decodeToObjectUrls, urlsOf } from './objectUrlImages';
import { openOnlineSceneTab } from './onlineSceneTab';
import type { RemoteImages } from './remoteScene';

/** What the Online scene view takes from the joined session. */
export interface OnlineSceneSink {
  session(state: PlayerSessionState): void;
  scene(scene: PlayerScene | null): void;
  camera(camera: SceneCamera): void;
  control(tokenIds: readonly string[]): void;
  moveRefused(tokenId: string): void;
  /** The shared dice log, newest first, whole. */
  diceLog(entries: readonly DiceLogEntry[]): void;
  laser(laser: PlayerLaser): void;
  /** Images arrived, failed or went. */
  images(): void;
  /** The session was left from elsewhere (a new join, the plugin unloading): close the tab. */
  close(): void;
}

export type JoinProblem = 'link' | 'name' | 'hosting' | 'joined';

export const JOIN_PROBLEM_TEXT: Record<JoinProblem, string> = {
  link: INCOMPLETE_LINK_TEXT,
  name: NAME_PROBLEM_TEXT,
  hosting: 'Stop hosting your online session before joining another.',
  joined: 'You are already in an online session. Close its tab to leave it first.',
};

export interface OnlineJoinDeps {
  createClient?: (server: JoinTarget['server']) => ClientTransport;
  openStore?: () => Promise<ImageStore | null>;
  decode?: ImageDecoder;
  /** Tests driven by fake timers pass a hash that resolves at once. */
  hash?: Hasher;
  /** Opens the Online scene tab; its view attaches itself. */
  openSceneTab?: () => Promise<void>;
  isHosting?: () => boolean;
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
}

export class OnlineJoinService {
  private static readonly instances = new WeakMap<App, OnlineJoinService>();
  static forApp(app: App): OnlineJoinService | undefined {
    return this.instances.get(app);
  }

  private joined: Joined | null = null;
  private sink: OnlineSceneSink | null = null;
  private cache: AssetCache | null = null;
  private readonly keys = new Map<string, string>();
  private readonly createClient: NonNullable<OnlineJoinDeps['createClient']>;
  private readonly openStore: NonNullable<OnlineJoinDeps['openStore']>;
  private readonly decode: ImageDecoder;
  private readonly hash: Hasher | undefined;
  private readonly openSceneTab: () => Promise<void>;
  private readonly isHosting: () => boolean;
  private readonly stopSettings: () => void;

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
    // Switching keeping off deletes the stored images at once.
    this.stopSettings = settings.onChange(() => { void this.cache?.setKeep(this.settings.getOnlineSettings().keepImages); });
    OnlineJoinService.instances.set(app, this);
  }

  /** The joined session as the player has it; null while Atlas joins none. */
  get state(): PlayerSessionState | null {
    return this.joined?.session?.state ?? null;
  }

  /** The name to offer in the Join dialog. */
  rememberedName(): string {
    return this.settings.getOnlineSettings().playerName;
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
    };
    this.joined = joined;
    this.startSession(joined);
    return null;
  }

  /** After the connection was lost: joins again with the same key, images and tab. */
  reconnect(): void {
    const joined = this.joined;
    if (!joined || joined.session?.state.status !== 'lost') return;
    this.startSession(joined);
  }

  /** Leaves the session: says bye, frees its images and closes its tab. */
  leave(): void {
    const joined = this.joined;
    if (!joined) return;
    this.joined = null;
    joined.session?.stop();
    joined.loader.dispose();
    joinedSessionStore.setState({ session: null });
    const sink = this.sink;
    this.sink = null;
    sink?.close();
  }

  /** The Online scene view attaches: it gets what is known so far, then every change. Null without a joined session. */
  attach(sink: OnlineSceneSink): (() => void) | null {
    const joined = this.joined;
    if (!joined?.session) return null;
    this.sink = sink;
    sink.session(joined.session.state);
    sink.control(joined.control);
    sink.diceLog(joined.dice);
    sink.scene(joined.scene);
    if (joined.camera) sink.camera(joined.camera);
    sink.images();
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
    this.stopSettings();
  }

  /** One key per GM host for this plugin's lifetime, so the GM recognises a reconnect. Piece 6b replaces it with stable per-table ids. */
  playerKeyFor(hostId: string): string {
    const known = this.keys.get(hostId);
    if (known) return known;
    const key = randomId();
    this.keys.set(hostId, key);
    return key;
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
        const merged = mergeDiceLog(joined.dice, entries, replay).list;
        if (merged === joined.dice) return;
        joined.dice = merged;
        this.sink?.diceLog(merged);
      },
      onLaser: (laser) => { if (current()) this.sink?.laser(laser); },
    });
    joined.session = session;
    session.start();
  }

  private changed(joined: Joined, state: PlayerSessionState): void {
    joinedSessionStore.setState({ session: state });
    this.sink?.session(state);
    if (state.status !== 'admitted' || joined.opened) return;
    joined.opened = true;
    this.openSceneTab().catch((error: unknown) => {
      console.error('[Atlas online] Could not open the online scene:', error);
    });
  }
}
