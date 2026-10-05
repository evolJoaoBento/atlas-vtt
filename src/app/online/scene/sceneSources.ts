/** What the broadcaster needs of its neighbours, and the change detection it shares with them. */
import { LIGHTING_SLICE_FIELDS } from '../coverage';
import type { SessionHandler, SessionPlayer } from '../GmSession';
import type { ControlMessage } from '../protocol';
import type { PresentedSceneInfo, PresentedSceneListener } from '../../services/PresentedScene';
import type { ResourceDefinition } from '../../resources/resourceTypes';
import type { ViewAtlasState } from '../../storeFactory';
import type { CollectionGridDefaults } from '../../types/collectionSettingsTypes';
import type { InitiativeRules } from '../../types/initiativeRulesTypes';
import type { FogOperation } from '../../types/fogTypes';
import type { AssetRegistry } from './AssetRegistry';
import { NO_DARKNESS, type Darkness } from './darknessFog';
import { FogCoverage } from './FogCoverage';
import type { PlayerViewRules } from './playerViewRules';
import type { ProjectionContext } from './projectForPlayers';
import { fogTruncated, projectFog, type ProjectionMemo } from './projectRecords';
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
  /** The cone angle the GM measures with on the map at `mapPath` (`mapConeAngle`); tests leave it out. */
  coneAngle?: (mapPath: string | null) => number;
  /** The resources of the collection holding the map at `mapPath`, which decide the bars players see; without it none show. */
  resources?: (mapPath: string | null) => readonly ResourceDefinition[];
  /** The initiative rules of the collection holding the map at `mapPath`, which say whether the list is by sides before a fight; without it the list is in turn order. */
  initiativeRules?: (mapPath: string | null) => InitiativeRules;
  /** Calls `listener` when a collection's settings change or the asset index loads (its resources or initiative rules may differ); returns the stop. */
  watchResources?: (listener: () => void) => () => void;
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
    ...LIGHTING_SLICE_FIELDS.map((field) => state[field]),
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

/** What players cannot see under the fog, and under the fog and a lit scene's darkness. */
export interface FogCoverages {
  coverage: FogCoverage;
  /** The fog and the darkness together; `coverage` itself without darkness. */
  darkCoverage: FogCoverage;
  /** The GM's fog and the darkness have more operations than the limit, so some would not be sent. */
  truncated: boolean;
}

/** Coverage rasterised from the fog players receive, and with the darkness over it, each rebuilt only when what it is made of changes. */
export class FogCoverageCache {
  private fog: { fog: Readonly<Record<string, FogOperation>>; coverage: FogCoverage; dropped: boolean } | null = null;
  private entry: { darkness: Darkness; coverages: FogCoverages } | null = null;

  /** A new darkness never replays the fog: it is painted over the fog's cells (`FogCoverage.covering`). */
  get(fog: Readonly<Record<string, FogOperation>>, memo: ProjectionMemo, darkness: Darkness = NO_DARKNESS): FogCoverages {
    const fogChanged = this.fog?.fog !== fog;
    if (!this.fog || fogChanged) this.fog = { fog, coverage: FogCoverage.fromPlayerFog(projectFog(fog, memo)), dropped: fogTruncated(fog, memo) };
    if (!this.entry || fogChanged || this.entry.darkness !== darkness) {
      const { coverage } = this.fog;
      const darkCoverage = coverage.covering(darkness.covered);
      const truncated = this.fog.dropped || Object.keys(fog).length + Object.keys(darkness.fog).length > SCENE_LIMITS.records;
      this.entry = { darkness, coverages: { coverage, darkCoverage, truncated } };
    }
    return this.entry.coverages;
  }
}

/** What the projection needs of the presented scene besides its store's slice. */
export function sceneContext(
  scene: PresentedSceneInfo,
  options: Pick<SceneBroadcasterOptions, 'collectionGrid' | 'coneAngle' | 'resources' | 'initiativeRules'>,
): Pick<ProjectionContext, 'mapSize' | 'collectionGrid' | 'coneAngle' | 'resources' | 'initiativeRules'> {
  const mapPath = scene.store.getState().mapPath ?? null;
  const coneAngle = options.coneAngle?.(mapPath);
  const initiativeRules = options.initiativeRules?.(mapPath);
  return {
    mapSize: scene.mapSize(),
    collectionGrid: options.collectionGrid?.(mapPath) ?? null,
    ...(coneAngle !== undefined && { coneAngle }),
    resources: options.resources?.(mapPath) ?? [],
    ...(initiativeRules && { initiativeRules }),
  };
}
