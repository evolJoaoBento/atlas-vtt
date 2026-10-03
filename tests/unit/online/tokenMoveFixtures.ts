/**
 * A GM with the real session, scene broadcaster and token control over an in-memory
 * network, and a scene store like Atlas's view store for what moves touch:
 * `setTokenPositions` and zundo undo history. `runHistoryTransaction` runs untracked
 * on a store without history, so a plain store would hide a missing undo step.
 */
import { vi } from 'vitest';
import { temporal } from 'zundo';
import { immer } from 'zustand/middleware/immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { TokenControlHost } from '../../../src/app/online/control/TokenControlHost';
import { GmSession, type SessionPlayer } from '../../../src/app/online/GmSession';
import { PlayerSession, type PlayerSessionOptions } from '../../../src/app/online/PlayerSession';
import { decodeControl, encodeControl, type ControlMessage } from '../../../src/app/online/protocol';
import { AssetRegistry } from '../../../src/app/online/scene/AssetRegistry';
import type { PlayerViewRules } from '../../../src/app/online/scene/playerViewRules';
import { SCENE_TICK_MS, SceneBroadcaster } from '../../../src/app/online/scene/SceneBroadcaster';
import { MemoryNetwork } from '../../../src/app/online/transport/MemoryTransport';
import type { ClientTransport, PeerLink } from '../../../src/app/online/transport/types';
import { PresentedScene, type PresentedView } from '../../../src/app/services/PresentedScene';
import type { ViewAtlasState } from '../../../src/app/storeFactory';
import { createHistoryOptions, getHistoryStore, type HistoryState } from '../../../src/app/stores/history';
import { createTabMetaStore } from '../../../src/app/stores/tabMetaStore';
import { memoryImageFiles, nodeHash } from './assetFixtures';
import { emptySceneState, type CameraSceneState } from './cameraFixtures';

export type MoveSceneState = CameraSceneState & Pick<ViewAtlasState, 'setTokenPositions'>;
type Tokens = CameraSceneState['objects']['tokens'];

/** hero and ally in the open, orc hidden, goblin under the fog rectangle from (900, 900) to (1300, 1300). */
export function partyTokens(): Tokens {
  return {
    hero: { id: 'hero', kind: 'character', x: 140, y: 140, imagePath: 'art/hero.png', name: 'Hero' },
    ally: { id: 'ally', kind: 'character', x: 280, y: 140, imagePath: 'art/ally.png', name: 'Ally' },
    orc: { id: 'orc', kind: 'character', x: 420, y: 140, imagePath: 'art/orc.png', name: 'Orc', isHidden: true },
    goblin: { id: 'goblin', kind: 'character', x: 1050, y: 1050, imagePath: 'art/goblin.png', name: 'Goblin' },
  } as unknown as Tokens;
}

/** A square 70 px grid with snapping on (the default), the party, and one fog rectangle. */
export function partyState(tokens: Tokens = partyTokens()): CameraSceneState {
  const state = emptySceneState();
  return {
    ...state,
    objects: {
      ...state.objects,
      tokens,
      fog: {
        f1: { id: 'f1', kind: 'fog', type: 'rectangle', timestamp: 1, isErasing: false, x: 900, y: 900, width: 400, height: 400 },
      } as unknown as CameraSceneState['objects']['fog'],
    },
  };
}

export function moveSceneStore(state: CameraSceneState = partyState()): { store: StoreApi<MoveSceneState>; history: () => HistoryState } {
  const store: StoreApi<MoveSceneState> = createStore<MoveSceneState>()(temporal(immer((set) => ({
    ...state,
    setTokenPositions: (positions: Array<{ id: string; x: number; y: number }>) => set((draft: MoveSceneState) => {
      for (const { id, x, y } of positions) {
        const token = draft.objects.tokens[id];
        if (token) {
          token.x = x;
          token.y = y;
        }
      }
    }),
  })), createHistoryOptions(() => store.getState())));
  return { store, history: () => getHistoryStore(store)!.getState() };
}

export interface MovePlayer {
  key: string;
  playerId: string;
  session: PlayerSession;
  /** Every control message the GM sent this player, on every link, decoded. */
  received: ControlMessage[];
  /** Sends text on the player's current link, as a modified page could. */
  sendRaw(text: string): void;
  /** A `token-move` on the player's current link, for the scene players have unless `sceneId` is given. */
  move(tokenId: string, x: number, y: number, sceneId?: string): void;
  refusals(): string[];
  controlLists(): string[][];
}

export function moveWorld(options: { state?: CameraSceneState; mapSize?: { width: number; height: number }; rules?: Partial<PlayerViewRules> } = {}) {
  const network = new MemoryNetwork();
  const requests: SessionPlayer[] = [];
  let host: TokenControlHost | null = null;
  const gm = new GmSession(network.host('gm'), {
    title: 'Vault', onJoinRequest: (player) => requests.push(player), onRequestClosed: () => {},
    // As `OnlineSessionService` does: a removed player loses their tokens.
    onPlayersChanged: (players) => host?.playersChanged(players),
  });
  gm.start();
  const rules: PlayerViewRules = {
    showGrid: true, showTokenNameplates: false, showWidgets: true, showInitiative: true, ...options.rules,
  };
  const settings = { getLocalPlayerViewSettings: (): PlayerViewRules => rules, onChange: (): (() => void) => () => {} };
  const presented = new PresentedScene();
  const assets = new AssetRegistry({ files: memoryImageFiles().source, notify: () => {}, hash: nodeHash });
  const broadcaster = new SceneBroadcaster({ session: gm, presented, settings, assets, notify: () => {} });
  broadcaster.start();
  const controlHost = new TokenControlHost({ session: gm, presented, projection: broadcaster });
  host = controlHost;
  controlHost.start();

  const { store, history } = moveSceneStore(options.state);
  const tabs = createTabMetaStore();
  const tavern = tabs.getState().addTab('maps/tavern.atlasmap', 'Tavern');
  const dungeon = tabs.getState().addTab('maps/dungeon.atlasmap', 'Dungeon');
  tabs.getState().setActiveTab(tavern);
  const mapSize = options.mapSize ?? { width: 2000, height: 1500 };
  const view = {
    tabMetaStore: tabs,
    atlasStore: store as unknown as StoreApi<ViewAtlasState>,
    register: () => {},
    renderer: { getBackgroundSprite: () => (mapSize.width > 0 ? { ...mapSize, destroyed: false } : null) },
  } as unknown as PresentedView;
  const players: MovePlayer[] = [];

  const join = async (key: string, extra: Partial<PlayerSessionOptions> = {}): Promise<MovePlayer> => {
    const before = requests.length;
    const inner = network.client();
    const received: ControlMessage[] = [];
    let link: PeerLink | null = null;
    const transport: ClientTransport = {
      connect: async (hostId: string): Promise<PeerLink> => {
        const next = await inner.connect(hostId);
        link = next;
        next.onMessage((channel, data) => {
          const decoded = channel === 'control' ? decodeControl(data) : null;
          if (decoded?.kind === 'message') received.push(decoded.message);
        });
        return next;
      },
    };
    const session = new PlayerSession({
      hostId: 'gm', name: key, playerKey: key, clientVersion: '1', transport, onChange: () => {}, ...extra,
    });
    session.start();
    await vi.advanceTimersByTimeAsync(0);
    if (requests.length > before) gm.allow(requests.at(-1)!.playerId);
    await vi.advanceTimersByTimeAsync(0);
    const player: MovePlayer = {
      key, playerId: session.state.playerId!, session, received,
      sendRaw: (text) => { link?.send('control', text); },
      move: (tokenId, x, y, sceneId = broadcaster.currentProjection()?.sceneId ?? 'none') => {
        link?.send('control', encodeControl({ v: 1, type: 'token-move', sceneId, tokenId, x, y }));
      },
      refusals: () => received.flatMap((message) => (message.type === 'token-move-refused' ? [message.tokenId] : [])),
      controlLists: () => received.flatMap((message) => (message.type === 'token-control' ? [message.tokenIds] : [])),
    };
    players.push(player);
    return player;
  };

  return {
    network, gm, broadcaster, host: controlHost, control: controlHost.control, presented, store, history,
    tabs, tavern, dungeon, view, join,
    present: (): void => presented.present(view, tavern),
    token: (id: string) => store.getState().objects.tokens[id],
    tick: (): Promise<void> => vi.advanceTimersByTimeAsync(SCENE_TICK_MS + 5),
    finish(): void {
      players.forEach((player) => player.session.stop());
      controlHost.stop();
      broadcaster.stop();
      gm.stop();
    },
  };
}

export type MoveWorld = ReturnType<typeof moveWorld>;
