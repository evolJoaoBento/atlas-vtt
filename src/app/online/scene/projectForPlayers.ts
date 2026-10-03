/**
 * The only place that decides what leaves the GM's machine: the presented
 * scene as online players may see it, exactly what the local player window
 * shows and nothing more. Every sent object is built field by field from the
 * GM's records, never spread, so anything this code does not name, including
 * fields a later Atlas adds, is left out.
 */
import { resolveMeasurementSettings } from '../../grid/measurementFormat';
import { DEFAULT_HEX_NUMBER_OPACITY, isHexNumberFormat } from '../../grid/hexNumbering';
import type { GridState } from '../../services/MapPersistence';
import type { ViewAtlasState } from '../../storeFactory';
import type { Character, TokenEntity } from '../../types';
import type { CollectionGridDefaults } from '../../types/collectionSettingsTypes';
import type { AssetIds } from './AssetRegistry';
import { finiteOr, finiteOrNull, oneOf, positiveOr, textOr, textOrNull, unitOr } from './coerce';
import type { FogCoverage } from './FogCoverage';
import type { LightingFrame } from './LiveLighting';
import { DEFAULT_GRID_SIZE, tokenBounds } from './objectBounds';
import type { PlayerViewRules } from './playerViewRules';
import { projectInitiative, projectWidgets } from './projectPanels';
import { projectDrawings, projectFog, projectRecord, projectTexts, type ProjectionMemo } from './projectRecords';
import {
  PLAYER_DIAGONAL_RULES, PLAYER_GRID_LINES, PLAYER_GRID_TYPES, PLAYER_MEASUREMENT_MODES, PLAYER_UNIT_TYPES, SCENE_LIMITS, SCENE_RANGES,
  type MapSize, type PlayerCondition, type PlayerGrid, type PlayerMap, type PlayerMeasurement, type PlayerScene, type PlayerToken,
} from './sceneTypes';

export type ProjectedState = Pick<
  ViewAtlasState,
  'background' | 'grid' | 'objects' | 'widgetSettings' | 'widgetValues' | 'initiative' | 'initiativeTrackerOpen'
>;

export interface ProjectionContext {
  sceneId: string;
  rules: PlayerViewRules;
  /** Rebuilt by the caller only when the fog operations, or the darkness of `lighting`, change. */
  coverage: FogCoverage;
  /**
   * With dynamic lighting on and the scene lit: which tokens the player window shows and the
   * darkness over the map, which `coverage` must include. Unset or null, nothing is lit.
   */
  lighting?: LightingFrame | null;
  assets: AssetIds;
  mapSize: MapSize;
  memo: ProjectionMemo;
  /** The grid defaults of the map's collection, which decide the measurement; without them the map's grid does. */
  collectionGrid?: CollectionGridDefaults | null;
}

const DEFAULT_RING = '#ffffff';
const DEFAULT_GRID_OPACITY = 0.7;

export function projectForPlayers(state: ProjectedState, context: ProjectionContext): PlayerScene {
  const objects = state.objects;
  // Raw (finite, positive) size for local coverage checks; the wire gets the clamped value.
  const cellSize = positiveOr(state.grid?.size, DEFAULT_GRID_SIZE);
  const lighting = context.lighting ?? null;
  // A token the player window does not show (unseen, or only sensed) is not sent, with its nameplate and bars.
  const tokens = projectRecord(objects?.tokens, (token, id) => (lighting && !lighting.seen(id) ? null : projectToken(token, context, cellSize)));
  const fog = projectFog(objects?.fog, context.memo);
  return {
    sceneId: context.sceneId,
    map: projectMap(state.background, cellSize, context),
    grid: projectGrid(state.grid, context.rules),
    tokens,
    // The darkness goes last, over the GM's fog: what the GM erased stays dark where the lighting hides it.
    fog: lighting ? { ...fog, ...lighting.darkness.fog } : fog,
    texts: projectTexts(objects?.texts, context.coverage),
    drawings: projectDrawings(objects?.drawings, context.coverage, context.memo),
    widgets: projectWidgets(state, context.rules),
    initiative: projectInitiative(state, new Set(Object.keys(tokens)), context.rules),
    measurement: projectMeasurement(context.collectionGrid ?? null, state.grid),
  };
}

function projectMap(background: string | null, cellSize: number, context: ProjectionContext): PlayerMap {
  return {
    asset: context.assets.idFor(background),
    width: finiteOr(context.mapSize.width, 0, SCENE_RANGES.mapSize),
    height: finiteOr(context.mapSize.height, 0, SCENE_RANGES.mapSize),
    cellSize: positiveOr(cellSize, DEFAULT_GRID_SIZE, SCENE_RANGES.cellSize),
  };
}

function projectGrid(grid: GridState | null, rules: PlayerViewRules): PlayerGrid | null {
  if (!rules.showGrid || !grid || grid.enabled === false || grid.visible === false) return null;
  const hexNumbers = isHexNumberFormat(grid.hexNumbers) ? grid.hexNumbers : null;
  return {
    type: oneOf(PLAYER_GRID_TYPES, grid.type, 'square'),
    size: positiveOr(grid.size, DEFAULT_GRID_SIZE, SCENE_RANGES.gridSize),
    offsetX: finiteOr(grid.offsetX, 0, SCENE_RANGES.coordinate),
    offsetY: finiteOr(grid.offsetY, 0, SCENE_RANGES.coordinate),
    color: textOrNull(grid.color),
    opacity: unitOr(grid.opacity, DEFAULT_GRID_OPACITY),
    lineType: oneOf(PLAYER_GRID_LINES, grid.lineType, 'solid'),
    lineWidth: positiveOr(grid.lineWidth, 1, SCENE_RANGES.stroke),
    hexNumbers,
    hexNumberOpacity: hexNumbers ? unitOr(grid.hexNumberOpacity, DEFAULT_HEX_NUMBER_OPACITY) : null,
  };
}

/** The settings Atlas's ruler and measure tool use for this map, field by field. */
function projectMeasurement(collection: CollectionGridDefaults | null, grid: GridState | null): PlayerMeasurement {
  const settings = resolveMeasurementSettings(collection ?? undefined, grid);
  const rangeBands: unknown = settings.rangeBands;
  const bands = Array.isArray(rangeBands) ? (rangeBands as unknown[]) : [];
  return {
    mode: oneOf(PLAYER_MEASUREMENT_MODES, settings.mode, 'metric'),
    unitType: oneOf(PLAYER_UNIT_TYPES, settings.unitType, 'feet'),
    unitDistance: finiteOr(settings.unitDistance, 5, SCENE_RANGES.unitDistance),
    diagonalRule: oneOf(PLAYER_DIAGONAL_RULES, settings.diagonalRule, 'equidistant'),
    snapToGrid: grid?.snapToGrid ?? true,
    rangeBands: bands.slice(0, SCENE_LIMITS.rangeBands).map((band) => {
      const { name, maxSquares } = (typeof band === 'object' && band !== null ? band : {}) as { name?: unknown; maxSquares?: unknown };
      return { name: textOr(name, '', SCENE_LIMITS.idLength), maxSquares: finiteOr(maxSquares, 1, SCENE_RANGES.rangeBand) };
    }),
  };
}

function projectToken(token: TokenEntity, context: ProjectionContext, cellSize: number): PlayerToken | null {
  // Any truthy value hides, as in the local window (`playerSafeFrame`, `PlayerInitiativePanel`).
  if (token.isHidden) return null;
  const x = finiteOrNull(token.x);
  const y = finiteOrNull(token.y);
  if (x === null || y === null) return null;
  const size = positiveOr(token.size, 1);
  // Coverage sees what the GM draws (raw values); the wire gets clamped values.
  if (context.coverage.isCovered(tokenBounds({ x, y, size }, cellSize))) return null;
  const character = token.kind === 'character' ? token : null;
  const { rules } = context;
  return {
    x: finiteOr(x, 0, SCENE_RANGES.coordinate),
    y: finiteOr(y, 0, SCENE_RANGES.coordinate),
    size: finiteOr(size, 1, SCENE_RANGES.tokenSize),
    rotation: finiteOr(token.rotation, 0),
    layer: finiteOr(token.layer, 0),
    image: context.assets.idFor(token.imagePath),
    ring: token.showRing === false ? null : textOr(token.ringColor, DEFAULT_RING),
    conditions: character ? projectConditions(token) : [],
    name: character && rules.showTokenNameplates ? displayName(character) : null,
    // Token resources (Atlas 0.5) replace HP and stress and are not sent yet: each collection
    // defines its own, shown to players by their `visibleToPlayers` (see `docs/online-play-features.md`).
    hp: null,
    stress: null,
  };
}

/** The nameplate text `TokenUIRenderer` shows: the name, the statblock's name, or a placeholder for a statblock. */
function displayName(token: Character): string | null {
  return textOrNull(token.name) ?? (token.statblockPath ? textOrNull(token.statblockName) ?? 'Unknown Creature' : null);
}

function projectConditions(token: TokenEntity): PlayerCondition[] {
  const ids: unknown[] = Array.isArray(token.conditions) ? token.conditions : [];
  const values: Record<string, unknown> = typeof token.conditionValues === 'object' && token.conditionValues !== null
    ? token.conditionValues
    : {};
  return ids
    .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= SCENE_LIMITS.idLength)
    .slice(0, SCENE_LIMITS.conditions)
    .map((id) => ({ id, value: Object.hasOwn(values, id) ? finiteOrNull(values[id]) : null }));
}
