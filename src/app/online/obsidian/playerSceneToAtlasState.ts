/**
 * The presented scene as Atlas's view store holds a map: every field the coverage tables
 * (`online/coverage.ts`) mark `sent`, rebuilt from what players receive. Pure. The online scene
 * view's `RemoteSceneApplier` writes the result into its store with builders that reuse records.
 */
import { DEFAULT_HEX_NUMBER_OPACITY } from '../../grid/hexNumbering';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { GridState } from '../../services/MapPersistence';
import type { ViewAtlasState } from '../../storeFactory';
import type { DrawingStroke, TextElement, TokenEntity } from '../../types';
import type { ResourceDefinition, ResourceValue } from '../../resources/resourceTypes';
import type { InitiativeRules } from '../../types/initiativeRulesTypes';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import type { FogOperation } from '../../types/fogTypes';
import { DEFAULT_GRID_SIZE } from '../scene/objectBounds';
import { setOwn } from '../scene/sceneDiff';
import {
  withMeasurementDefaults,
  type PlayerDrawing, type PlayerFogOp, type PlayerMeasurement, type PlayerScene, type PlayerText, type PlayerToken, type ScenePoint,
} from '../scene/sceneTypes';
import { atlasInitiative, atlasInitiativeRules, atlasWidgets } from './convertPanels';
import { atlasDrawing, atlasFog, atlasText } from './convertShapes';
import { atlasInitiativeHealth, atlasResourceDefinitions } from './convertResources';
import { atlasToken, neutralConditions } from './convertTokens';
import { atlasMeasurement, type RemoteImages } from './remoteScene';

export type RemoteAtlasState = Pick<
  ViewAtlasState,
  'background' | 'grid' | 'objects' | 'widgetSettings' | 'widgetValues' | 'initiative' | 'initiativeTrackerOpen'
>;

export interface RemoteSceneParts {
  state: RemoteAtlasState;
  /** For `remoteScene.measurement`: the ruler and the measure tool. */
  measurement: MeasurementSettings;
  /** For `remoteScene.conditions`: the badges. */
  conditions: ConditionDefinition[];
  /** For `remoteScene.resources`: the bars, and the downed state. */
  resources: Record<string, readonly ResourceDefinition[]>;
  /** For `remoteScene.initiativeHealth`: the bar after a combatant's name. */
  initiativeHealth: Record<string, ResourceValue>;
  /** For `remoteScene.initiativeRules`: whether the list is by sides before a fight. */
  initiativeRules: InitiativeRules;
}

/** Builds each record kind; the applier passes builders that reuse unchanged records. */
export interface RecordBuilders {
  tokens(tokens: Readonly<Record<string, PlayerToken>>): Record<string, TokenEntity>;
  fog(fog: Readonly<Record<string, PlayerFogOp>>): Record<string, FogOperation>;
  texts(texts: Readonly<Record<string, PlayerText>>): Record<string, TextElement>;
  drawings(drawings: Readonly<Record<string, PlayerDrawing>>): Record<string, DrawingStroke>;
}

/** Converts every record of a kind, keeping ids as own properties. */
export function mapRecords<S, A>(records: Readonly<Record<string, S>>, convert: (id: string, record: S) => A): Record<string, A> {
  const result: Record<string, A> = {};
  for (const [id, record] of Object.entries(records)) setOwn(result, id, convert(id, record));
  return result;
}

/** Builders that convert every record anew; `positionOf` places tokens this view shows elsewhere. */
export function plainBuilders(images: RemoteImages, positionOf: (tokenId: string) => ScenePoint | null = () => null): RecordBuilders {
  return {
    tokens: (tokens) => mapRecords(tokens, (id, token) => atlasToken(id, token, images.token(token.image) ?? '', positionOf(id))),
    fog: (fog) => mapRecords(fog, atlasFog),
    texts: (texts) => mapRecords(texts, atlasText),
    drawings: (drawings) => mapRecords(drawings, atlasDrawing),
  };
}

/** The grid's measurement fields; Atlas's ruler reads the full settings from `remoteScene.measurement`. */
function gridUnits(measurement: PlayerMeasurement): Pick<GridState, 'snapToGrid' | 'measurementType' | 'unitType' | 'unitDistance'> {
  return {
    snapToGrid: measurement.snapToGrid,
    measurementType: measurement.mode === 'metric' ? 'units' : 'abstract',
    ...(measurement.unitType !== 'custom' ? { unitType: measurement.unitType } : {}),
    unitDistance: measurement.unitDistance,
  };
}

/** A grid the GM hides keeps the map's cell size, so tokens keep their size and drops still snap. */
export function atlasGrid(scene: PlayerScene): GridState {
  const units = gridUnits(scene.measurement);
  const grid = scene.grid;
  if (!grid) {
    return { enabled: true, visible: false, type: 'square', size: scene.map.cellSize, offsetX: 0, offsetY: 0, opacity: 0, ...units };
  }
  return {
    enabled: true,
    visible: true,
    type: grid.type,
    size: grid.size,
    offsetX: grid.offsetX,
    offsetY: grid.offsetY,
    ...(grid.color !== null ? { color: grid.color } : {}),
    opacity: grid.opacity,
    lineType: grid.lineType,
    lineWidth: grid.lineWidth,
    ...(grid.hexNumbers !== null
      ? { hexNumbers: grid.hexNumbers, hexNumberOpacity: grid.hexNumberOpacity ?? DEFAULT_HEX_NUMBER_OPACITY }
      : {}),
    ...units,
  };
}

function objectsOf(builders: RecordBuilders, scene: Pick<PlayerScene, 'tokens' | 'fog' | 'texts' | 'drawings'>): ViewAtlasState['objects'] {
  return {
    tokens: builders.tokens(scene.tokens),
    fog: builders.fog(scene.fog),
    pins: {},
    texts: builders.texts(scene.texts),
    drawings: builders.drawings(scene.drawings),
    walls: {},
    lights: {},
    audios: {},
  };
}

export function playerSceneToAtlasState(scene: PlayerScene, images: RemoteImages, builders: RecordBuilders = plainBuilders(images)): RemoteSceneParts {
  const objects = objectsOf(builders, scene);
  return {
    state: {
      background: images.background(scene.map.asset),
      grid: atlasGrid(scene),
      objects,
      ...atlasWidgets(scene.widgets),
      ...atlasInitiative(scene.initiative, objects.tokens),
    },
    measurement: atlasMeasurement(scene.measurement),
    conditions: neutralConditions(scene.tokens),
    resources: atlasResourceDefinitions(scene.tokens),
    initiativeHealth: atlasInitiativeHealth(scene.initiative),
    initiativeRules: atlasInitiativeRules(scene.initiative),
  };
}

/** The GM shows no scene: an empty map with Atlas's default measurement. */
export function emptyRemoteScene(builders: RecordBuilders): RemoteSceneParts {
  const measurement = withMeasurementDefaults(undefined);
  return {
    state: {
      background: null,
      grid: { enabled: true, visible: false, type: 'square', size: DEFAULT_GRID_SIZE, offsetX: 0, offsetY: 0, opacity: 0, ...gridUnits(measurement) },
      objects: objectsOf(builders, { tokens: {}, fog: {}, texts: {}, drawings: {} }),
      ...atlasWidgets([]),
      ...atlasInitiative(null, {}),
    },
    measurement: atlasMeasurement(measurement),
    conditions: [],
    resources: {},
    initiativeHealth: {},
    initiativeRules: atlasInitiativeRules(null),
  };
}
