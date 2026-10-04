import { Notice, type App } from 'obsidian';
import { AssetService } from '../services/AssetService';
import { mapResources } from '../resources/collectionResources';
import type { ResourceDefinition } from '../resources/resourceTypes';
import { collectionGridDefaultsFor, mapConeAngle } from '../services/mapMeasurementSettings';
import { mapDiceRules } from '../services/mapDiceRules';
import { mapInitiativeRules } from '../services/mapInitiativeRules';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import type { DiceRules } from '../types/diceRulesTypes';
import { watchCollectionResources } from './watchCollectionResources';
import { presentedScene } from '../services/PresentedScene';
import type { SettingsService } from '../services/SettingsService';
import type { CollectionGridDefaults } from '../types/collectionSettingsTypes';
import { GmSession, type SessionPlayer } from './GmSession';
import { buildJoinUrl, parseJoinFragment } from './joinLink';
import { createOnlineLog, loggedSession, logPresentedScene } from './onlineLog';
import { onlineSessionStore, resetOnlineSessionStore } from './onlineSessionStore';
import { peerServerOptions } from './onlineSettings';
import { normalizePlayerName } from './protocol';
import { webIdentityCrypto, type IdentityCrypto, type TableIdentity } from './sharing/identity/identityCrypto';
import { hostedTable, tableReissuer, type HostedTable } from './sharing/identity/reissue';
import { ensureTableIdentity } from './sharing/identity/tableKey';
import { AssetServer } from './assets/AssetServer';
import { vaultImageFiles } from './assets/vaultImageFiles';
import { AssetRegistry, type ImageFiles } from './scene/AssetRegistry';
import { CameraSender } from './scene/CameraSender';
import { TokenControlHost } from './control/TokenControlHost';
import { DiceHost } from './tools/DiceHost';
import { documentDiceFeed, type DiceFeed } from './diceFeed';
import { LaserRelay } from './tools/LaserRelay';
import { SceneBroadcaster, type PresentedSceneSource } from './scene/SceneBroadcaster';
import { createPeerHost, type PeerServerOptions } from './transport/PeerTransport';
import type { HostTransport } from './transport/types';
import { isInSession, joinedSessionStore } from './obsidian/joinedSessionStore';
import { HostIdentity } from './sharing/people/hostIdentity';
import { IdentityDesk } from './sharing/people/IdentityDesk';
import { PeopleBook } from './sharing/people/PeopleBook';
import { showJoinRequestNotice, type JoinRequestInfo } from './ui/joinRequestNotice';

/** Sharing joins a hosted session that has a table; `started` returns what stops it. */
export interface HostedSharingHooks {
  started(context: { session: GmSession; table: HostedTable }): () => void;
}

const BAD_PAGE_URL = "The player page address in Settings → Online play isn't a valid web address.";
const HOSTING_WHILE_JOINED = 'Leave the online session you joined before hosting one.';
const RELAY_TOO_LONG = 'Your relay (TURN) settings are too long for a join link — remove some.';

interface Deps {
  /** Whether this Atlas is in a session it joined; the joined session store unless a test passes its own. */
  isJoined?: () => boolean;
  createHost?: (options: PeerServerOptions) => Promise<HostTransport>;
  showRequest?: (player: SessionPlayer, answer: (allow: boolean) => void, info?: JoinRequestInfo) => { hide(): void };
  /** The people list; this vault's unless a test passes its own. */
  people?: PeopleBook;
  /** Which scene players see; the plugin's `presentedScene` unless a test passes its own. */
  presented?: PresentedSceneSource;
  /** The vault's images; tests pass their own. */
  images?: ImageFiles;
  /** The grid defaults of a map's collection; Atlas's asset index unless a test passes its own. */
  collectionGrid?: (mapPath: string | null) => CollectionGridDefaults | null;
  /** The cone angle the GM measures with on a map; Atlas's asset index unless a test passes its own. */
  coneAngle?: (mapPath: string | null) => number;
  /** The resources of a map's collection; Atlas's asset index unless a test passes its own. */
  resources?: (mapPath: string | null) => readonly ResourceDefinition[];
  /** The initiative rules of a map's collection; Atlas's asset index unless a test passes its own. */
  initiativeRules?: (mapPath: string | null) => InitiativeRules;
  /** Tells when those resources or rules may have changed; the collection settings events unless a test passes its own. */
  watchResources?: (listener: () => void) => () => void;
  /** Atlas's dice rolls; the `atlas-dice-rolled` document event unless a test passes its own. */
  diceFeed?: DiceFeed;
  /** The dice rules of a map's collection; Atlas's asset index unless a test passes its own. */
  diceRules?: (mapPath: string | null) => DiceRules;
  /** The GM's table key; made in the settings on first use unless a test passes its own (or none). */
  table?: () => Promise<TableIdentity | null>;
  identityCrypto?: IdentityCrypto;
}

function errorText(error: unknown): string {
  return error instanceof Object && 'message' in error ? String(error.message) : String(error);
}

/** Hosts one online session for the vault at a time; the UI reads `onlineSessionStore`. */
export class OnlineSessionService {
  private static instances = new WeakMap<App, OnlineSessionService>();
  static forApp(app: App): OnlineSessionService | undefined {
    return this.instances.get(app);
  }

  private current: GmSession | null = null;
  private broadcaster: SceneBroadcaster | null = null;
  private registry: AssetRegistry | null = null;
  private assetServer: AssetServer | null = null;
  private cameraSender: CameraSender | null = null;
  private tokenControlHost: TokenControlHost | null = null;
  private diceHost: DiceHost | null = null;
  private laserRelay: LaserRelay | null = null;
  private readonly diceFeed: DiceFeed;
  private readonly diceRules: (mapPath: string | null) => DiceRules;
  private stopLog: (() => void) | null = null;
  private readonly presented: PresentedSceneSource;
  private readonly images: ImageFiles;
  private generation = 0;
  private unsubscribeErrors: (() => void) | null = null;
  private requests: HostIdentity | null = null;
  private readonly people: PeopleBook;
  private readonly createHost: (options: PeerServerOptions) => Promise<HostTransport>;
  private readonly showRequest: NonNullable<Deps['showRequest']>;
  private readonly isJoined: () => boolean;
  private readonly collectionGrid: (mapPath: string | null) => CollectionGridDefaults | null;
  private readonly coneAngle: (mapPath: string | null) => number;
  private readonly resources: (mapPath: string | null) => readonly ResourceDefinition[];
  private readonly initiativeRules: (mapPath: string | null) => InitiativeRules;
  private readonly watchResources: (listener: () => void) => () => void;
  private readonly loadTable: () => Promise<TableIdentity | null>;
  private readonly identityCrypto: IdentityCrypto;
  private currentTable: HostedTable | null = null;
  private currentHostId: string | null = null;
  private sharingHooks: HostedSharingHooks | null = null;
  private stopSharing: (() => void) | null = null;

  constructor(private readonly app: App, private readonly settings: SettingsService, deps: Deps = {}) {
    this.createHost = deps.createHost ?? createPeerHost;
    this.people = deps.people ?? PeopleBook.forApp(app);
    this.showRequest = deps.showRequest ?? showJoinRequestNotice;
    this.isJoined = deps.isJoined ?? ((): boolean => isInSession(joinedSessionStore.getState()));
    this.presented = deps.presented ?? presentedScene;
    this.diceFeed = deps.diceFeed ?? documentDiceFeed();
    this.diceRules = deps.diceRules ?? ((mapPath) => mapDiceRules(app, mapPath));
    this.images = deps.images ?? vaultImageFiles(app);
    this.collectionGrid = deps.collectionGrid
      ?? ((mapPath) => (mapPath ? collectionGridDefaultsFor(AssetService.getInstance(app), mapPath) : null));
    this.coneAngle = deps.coneAngle ?? ((mapPath) => mapConeAngle(AssetService.getInstance(app), mapPath));
    this.resources = deps.resources ?? ((mapPath) => mapResources(AssetService.getInstance(app), mapPath));
    this.initiativeRules = deps.initiativeRules ?? ((mapPath) => mapInitiativeRules(app, mapPath));
    this.watchResources = deps.watchResources ?? ((listener) => watchCollectionResources(app, listener));
    this.identityCrypto = deps.identityCrypto ?? webIdentityCrypto;
    this.loadTable = deps.table ?? ((): Promise<TableIdentity | null> => ensureTableIdentity(this.settings, this.identityCrypto));
    OnlineSessionService.instances.set(app, this);
  }

  /** Sharing's hooks for every session hosted from now on (`registerSharing`). */
  useSharingHooks(hooks: HostedSharingHooks | null): void {
    this.sharingHooks = hooks;
  }

  get session(): GmSession | null {
    return this.current;
  }

  /** This Atlas's table while hosting (never its private key); null otherwise or when it has none. */
  get table(): HostedTable | null { return this.current ? this.currentTable : null; }

  /** The current host id while hosting. */
  get hostId(): string | null { return this.current ? this.currentHostId : null; }

  async start(): Promise<void> {
    if (this.current || onlineSessionStore.getState().status === 'starting') return;
    if (this.isJoined()) {
      onlineSessionStore.setState({ status: 'error', error: HOSTING_WHILE_JOINED });
      return;
    }
    onlineSessionStore.setState({ status: 'starting', error: null });
    const generation = ++this.generation;
    try {
      await this.host(generation);
    } catch (error) {
      if (generation === this.generation) onlineSessionStore.setState({ status: 'error', error: errorText(error) });
    }
  }

  private async host(generation: number): Promise<void> {
    const online = this.settings.getOnlineSettings();
    const host = await this.createHost(peerServerOptions(online));
    if (generation !== this.generation) {
      host.close();
      return;
    }
    let table: TableIdentity | null = null;
    try {
      table = await this.loadTable();
    } catch (error) {
      console.error('[Atlas online] Could not prepare the table key; hosting without sharing:', error);
    }
    if (generation !== this.generation) {
      host.close();
      return;
    }
    this.currentTable = table ? hostedTable(this.identityCrypto, table, host.id, () => normalizePlayerName(this.settings.getOnlineSettings().playerName) ?? 'GM') : null;
    this.currentHostId = host.id;
    const requests = new HostIdentity({
      desk: this.currentTable ? new IdentityDesk({ people: this.people, table: this.currentTable }) : null,
      session: () => this.current,
      showRequest: this.showRequest,
    });
    this.requests = requests;
    let joinUrl: string;
    let linkWorks: boolean;
    try {
      joinUrl = buildJoinUrl(online.playerPageUrl, host.id, online, table?.id ?? null);
      linkWorks = parseJoinFragment(new URL(joinUrl).hash) !== null;
    } catch {
      host.close();
      throw new Error(BAD_PAGE_URL);
    }
    // Diagnostics (Settings → Online play → Log online play events), read on every event.
    const log = createOnlineLog(() => this.settings.getOnlineSettings().logEvents);
    const session = new GmSession(host, {
      title: this.app.vault.getName(),
      // A person admitted with an id who joins again on a new join gets a fresh table proof for its nonce.
      ...(this.currentTable ? { reissue: tableReissuer(this.currentTable) } : {}),
      onJoinRequest: (player, device) => requests.joinRequest(player, device),
      onRequestClosed: (playerId) => requests.requestClosed(playerId),
      onPlayersChanged: (players) => {
        log.event('players', { players: players.map((player) => `${player.name}: ${player.status}`).join(', ') });
        // A kick reaches no handler: the host keeps only the players the session still knows.
        this.tokenControlHost?.playersChanged(players);
        this.diceHost?.playersChanged(players);
        this.laserRelay?.playersChanged(players);
        onlineSessionStore.setState({ players, error: null });
      },
    });
    // Signaling hiccups while hosting are not fatal: keep hosting, show the note.
    this.unsubscribeErrors = host.onError((error) => {
      if (generation === this.generation) onlineSessionStore.setState({ error: error.message });
    });
    session.start();
    // Sends the presented scene, including one presented before the session started.
    const notify = (message: string): Notice => new Notice(message);
    // One registry per session: fingerprints are cached for the session, the size notice shows once.
    const registry = new AssetRegistry({ files: this.images, notify });
    this.registry = registry;
    // The broadcaster and the camera sender send through the log, so diagnostics see every scene message.
    const scenes = loggedSession(session, log);
    const broadcaster = new SceneBroadcaster({
      session: scenes, presented: this.presented, settings: this.settings, assets: registry, notify, collectionGrid: this.collectionGrid, coneAngle: this.coneAngle,
      resources: this.resources, initiativeRules: this.initiativeRules, watchResources: this.watchResources,
    });
    // The GM's view of the presented scene, which players follow by default; registered after the broadcaster.
    const cameraSender = new CameraSender({ session: scenes, presented: this.presented, projection: broadcaster });
    this.cameraSender = cameraSender;
    // Players move the tokens the GM assigns them; registered last, so control lists follow snapshots and cameras.
    const tokenControlHost = new TokenControlHost({ session: scenes, presented: this.presented, projection: broadcaster });
    this.tokenControlHost = tokenControlHost;
    // Players' dice and lasers; registered after the token control host.
    const diceHost = new DiceHost({
      session: scenes, presented: this.presented, projection: broadcaster, feed: this.diceFeed, diceRules: this.diceRules,
    });
    this.diceHost = diceHost;
    const laserRelay = new LaserRelay({ session: scenes, presented: this.presented, projection: broadcaster, gmColor: () => this.settings.getLaserPointerSettings().color });
    this.laserRelay = laserRelay;
    // Serves the images of the scene players have, over each player's assets channel.
    const assetServer = new AssetServer({ session, projection: broadcaster, files: registry });
    this.assetServer = assetServer;
    this.broadcaster = broadcaster;
    this.current = session;
    try {
      this.stopLog = logPresentedScene(this.presented, log);
      broadcaster.start();
      cameraSender.start();
      assetServer.start();
      tokenControlHost.start();
      diceHost.start();
      laserRelay.start();
      if (this.currentTable && this.sharingHooks) this.stopSharing = this.sharingHooks.started({ session, table: this.currentTable });
    } catch (error) {
      // No session may keep running without its broadcaster; `start` reports the error.
      this.teardown();
      throw error;
    }
    onlineSessionStore.setState({
      status: 'hosting', peerId: host.id, joinUrl, error: linkWorks ? null : RELAY_TOO_LONG, tokenControl: tokenControlHost.control,
    });
  }

  stop(): void {
    this.generation++;
    this.teardown();
    resetOnlineSessionStore();
  }

  /** Releases everything a hosted session holds; the store is left to the caller. */
  private teardown(): void {
    this.stopSharing?.();
    this.stopSharing = null;
    this.unsubscribeErrors?.();
    this.unsubscribeErrors = null;
    this.assetServer?.stop();
    this.assetServer = null;
    this.tokenControlHost?.stop();
    this.tokenControlHost = null;
    this.laserRelay?.stop();
    this.laserRelay = null;
    this.diceHost?.stop();
    this.diceHost = null;
    this.cameraSender?.stop();
    this.cameraSender = null;
    this.stopLog?.();
    this.stopLog = null;
    this.broadcaster?.stop();
    this.broadcaster = null;
    this.registry?.dispose();
    this.registry = null;
    this.current?.stop();
    this.current = null;
    this.requests?.stop();
    this.requests = null;
    this.currentTable = null;
    this.currentHostId = null;
  }

  /** Admits a waiting player: as who their device is for an Obsidian player, as before for a web player. */
  allow(playerId: string): void { this.requests?.allow(playerId); }
  /** Admits a new device as a known person: only the GM links. */
  link(playerId: string, personId: string): void { this.requests?.link(playerId, personId); }
  /** Admits a new device as someone added by name before meeting them: only the GM links. */
  linkPlaceholder(playerId: string, name: string): void { this.requests?.linkPlaceholder(playerId, name); }
  deny(playerId: string): void { this.requests?.deny(playerId); }
  kick(playerId: string): void { this.current?.kick(playerId); }
}
