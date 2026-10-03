/** What the broadcaster needs of its neighbours, and the change detection it shares with them. */
import type { SessionHandler, SessionPlayer } from '../GmSession';
import type { ControlMessage } from '../protocol';
import type { PresentedSceneInfo, PresentedSceneListener } from '../../services/PresentedScene';
import type { ViewAtlasState } from '../../storeFactory';
import type { CollectionGridDefaults } from '../../types/collectionSettingsTypes';
import type { FogOperation } from '../../types/fogTypes';
import type { AssetRegistry } from './AssetRegistry';
import { NO_DARKNESS, type Darkness } from './darknessFog';
import { FogCoverage } from './FogCoverage';
import type { PlayerViewRules } from './playerViewRules';
import type { ProjectionContext } from './projectForPlayers';
import { projectFog, type ProjectionMemo } from './projectRecords';
import { SCENE_LIMITS } from './sceneTypes';

export interface SceneSession {
  use(handler: SessionHandler): () => void;
  send(playerId: string, message: ControlMessage): void;
  getPlayers(): SessionPlayer[];
}

export interface PresentedSceneSource {
  current(): PresentedSceneInfo | null;
  isHeld(): boolean;
  subscribe(listener: PresentedSceneListener): () => void;
}

export interface PlayerViewSettingsSource {
  getLocalPlayerViewSettings(): PlayerViewRules;
  onChange(listener: () => void): () => void;
}

export interface SceneBroadcasterOptions {
  session: SceneSession;
  presented: PresentedSceneSource;
  settings: PlayerViewSettingsSource;
  /** The session's content registry: fingerprints for the projection, and when to project again. */
  assets: Pick<AssetRegistry, 'idFor' | 'onChange'>;
  /** Tells the GM something; `OnlineSessionService` shows an Obsidian notice. */
  notify(message: string): void;
  /** The grid defaults of the collection holding the map at `mapPath`; tests leave it out. */
  collectionGrid?: (mapPath: string | null) => CollectionGridDefaults | null;
}

export type Slice = readonly unknown[];

/**
 * The store fields the projection reads, and those the view's lighting reads besides (the scene's
 * lighting options, its explored memory, the tokens held while sight waits for the drop); changes
 * elsewhere (camera, selection, tools) send nothing.
 */
export function sliceOf(state: ViewAtlasState): Slice {
  return [
    state.background, state.grid, state.objects, state.widgetSettings,
    state.widgetValues, state.initiative, state.initiativeTrackerOpen,
    state.lighting, state.exploredMask, state.heldTokens,
  ];
}

export function sameSlice(a: Slice, b: Slice): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Changes are batched and sent at most this often. */
export const SCENE_TICK_MS = 50;

export const SCENE_TOO_LARGE_NOTICE = 'This scene is too large to send to online players.';
export const FOG_TRUNCATED_NOTICE = 'This scene has too much fog to show to online players.';

/** The presented scene while it is shown (not held). */
export interface LiveScene {
  readonly scene: PresentedSceneInfo;
  readonly sceneId: string;
  loading: boolean;
  slice: Slice | null;
  readonly unsubscribe: () => void;
}

/** Coverage rasterised from the fog players receive and the darkness over it, rebuilt only when either changes. */
export class FogCoverageCache {
  private entry: { fog: Readonly<Record<string, FogOperation>>; darkness: Darkness; coverage: FogCoverage; truncated: boolean } | null = null;

  /** `truncated`: the GM's fog and the darkness have more operations than the limit, so some would not be sent. */
  get(fog: Readonly<Record<string, FogOperation>>, memo: ProjectionMemo, darkness: Darkness = NO_DARKNESS): { coverage: FogCoverage; truncated: boolean } {
    if (this.entry?.fog !== fog || this.entry.darkness !== darkness) {
      const sent = projectFog(fog, memo);
      this.entry = {
        fog,
        darkness,
        coverage: FogCoverage.fromPlayerFog(sent, darkness.covered),
        truncated: Object.keys(fog).length + Object.keys(darkness.fog).length > SCENE_LIMITS.records,
      };
    }
    return this.entry;
  }
}

/** What the projection needs of the presented scene besides its store's slice. */
export function sceneContext(
  scene: PresentedSceneInfo,
  options: Pick<SceneBroadcasterOptions, 'collectionGrid'>,
): Pick<ProjectionContext, 'mapSize' | 'collectionGrid'> {
  return { mapSize: scene.mapSize(), collectionGrid: options.collectionGrid?.(scene.store.getState().mapPath ?? null) ?? null };
}
