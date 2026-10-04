/**
 * The only place that decides what leaves the GM's machine: the presented
 * scene as online players may see it, exactly what the local player window
 * shows and nothing more. Every sent object is built field by field from the
 * GM's records, never spread, so anything this code does not name, including
 * fields a later Atlas adds, is left out.
 */
import { DEFAULT_INITIATIVE_RULES } from '../../gameSystems/initiativeRules';
import { DEFAULT_CONE_ANGLE, isValidConeAngle, resolveMeasurementSettings } from '../../grid/measurementFormat';
import { DEFAULT_HEX_NUMBER_OPACITY, isHexNumberFormat } from '../../grid/hexNumbering';
import type { GridState } from '../../services/MapPersistence';
import type { ViewAtlasState } from '../../storeFactory';
import type { Character, TokenEntity } from '../../types';
import type { ResourceDefinition } from '../../resources/resourceTypes';
import type { CollectionGridDefaults } from '../../types/collectionSettingsTypes';
import type { InitiativeRules } from '../../types/initiativeRulesTypes';
import type { AssetIds } from './AssetRegistry';
import { finiteOr, finiteOrNull, oneOf, positiveOr, textOr, textOrNull, unitOr } from './coerce';
import type { FogCoverage, WorldBounds } from './FogCoverage';
import type { LightingFrame } from './LiveLighting';
import { DEFAULT_GRID_SIZE, tokenBounds } from './objectBounds';
import type { PlayerViewRules } from './playerViewRules';
import { projectInitiative, projectWidgets, withCombatantSides } from './projectPanels';
import { projectDrawings, projectFog, projectRecord, projectTexts, type ProjectionMemo } from './projectRecords';
import { isDowned, projectBars } from './projectResources';
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
  /** The GM's fog players receive; rebuilt by the caller only when the fog operations change. */
  coverage: FogCoverage;
  /**
   * With dynamic lighting on and the scene lit: which tokens the player window shows and the
   * darkness over the map. Unset or null, nothing is lit.
   */
  lighting?: LightingFrame | null;
  /**
   * The fog with the darkness of `lighting` over it, which texts and drawings are checked
   * against; unset, `coverage`. Tokens are not: the window shows a token by its perception
   * alone, and one it sees is never wholly dark (a darkness that lags would drop it).
   */
  darkCoverage?: FogCoverage;
  assets: AssetIds;
  mapSize: MapSize;
  memo: ProjectionMemo;
  /** The grid defaults of the map's collection, which decide the measurement; without them the map's grid does. */
  collectionGrid?: CollectionGridDefaults | null;
  /** The cone angle the GM's measure tool opens on this map (`mapConeAngle`); without it, the collection's grid defaults decide. */
  coneAngle?: number;
  /**
   * The resources of the map's collection, which decide the bars players see (`projectBars`); without
   * them nothing is shown, so a map whose collection is unknown shows no resource.
   */
  resources?: readonly ResourceDefinition[];
  /**
   * The initiative rules of the map's collection, which decide whether the list is by sides before
   * a fight starts (`projectSides`); without them the default rules apply: turn order.
   */
  initiativeRules?: InitiativeRules;
}

const DEFAULT_RING = '#ffffff';
const NO_RESOURCES: readonly ResourceDefinition[] = [];
const DEFAULT_GRID_OPACITY = 0.7;

export function projectForPlayers(state: ProjectedState, context: ProjectionContext): PlayerScene {
  const objects = state.objects;
  // Raw (finite, positive) size for local coverage checks; the wire gets the clamped value.
  const cellSize = positiveOr(state.grid?.size, DEFAULT_GRID_SIZE);
  const lighting = context.lighting ?? null;
  const initiativeRules = context.initiativeRules ?? DEFAULT_INITIATIVE_RULES;
  // A token the player window does not show (unseen, or only sensed) is not sent, with its nameplate and bars.
  const seen = projectRecord(objects?.tokens, (token, id) => (lighting && !lighting.seen(id) ? null : projectToken(token, context, cellSize)));
  const initiative = projectInitiative(state, new Set(Object.keys(seen)), context.rules, context.resources ?? NO_RESOURCES, initiativeRules);
  const tokens = withCombatantSides(seen, initiative, objects?.tokens);
  const fog = projectFog(objects?.fog, context.memo);
  const hidden = hiddenFrom(context, lighting !== null);
  return {
    sceneId: context.sceneId,
    map: projectMap(state.background, cellSize, context),
    grid: projectGrid(state.grid, context.rules),
    tokens,
    // The darkness goes last, over the GM's fog: what the GM erased stays dark where the lighting hides it.
    fog: lighting ? { ...fog, ...lighting.darkness.fog } : fog,
    texts: projectTexts(objects?.texts, hidden),
    drawings: projectDrawings(objects?.drawings, hidden, context.memo),
    widgets: projectWidgets(state, context.rules),
    initiative,
    measurement: projectMeasurement(context.collectionGrid ?? null, state.grid, context.coneAngle),
  };
}

/**
 * What texts and drawings are checked against. Under lighting the darkness is clipped to the map and a
 * coverage grid answers false outside it, so anything not wholly inside the map (or on a map of unknown
 * size) counts as hidden: the dark beyond the edge would otherwise leak what sits in it.
 */
function hiddenFrom(context: ProjectionContext, lit: boolean): Pick<FogCoverage, 'isCovered'> {
  const base = context.darkCoverage ?? context.coverage;
  if (!lit) return base;
  const { width: w, height: h } = context.mapSize;
  const inMap = (b: WorldBounds): boolean => w > 0 && h > 0 && b.x >= 0 && b.y >= 0 && b.x + b.width <= w && b.y + b.height <= h;
  return { isCovered: (b) => !inMap(b) || base.isCovered(b) };
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
function projectMeasurement(collection: CollectionGridDefaults | null, grid: GridState | null, coneAngle?: number): PlayerMeasurement {
  const settings = resolveMeasurementSettings(collection ?? undefined, grid);
  // `mapConeAngle` gives only valid angles; one the page would refuse (from a share's raw grid defaults) opens a quarter circle.
  const cone = coneAngle ?? settings.coneAngle;
  const rangeBands: unknown = settings.rangeBands;
  const bands = Array.isArray(rangeBands) ? (rangeBands as unknown[]) : [];
  return {
    mode: oneOf(PLAYER_MEASUREMENT_MODES, settings.mode, 'metric'),
    unitType: oneOf(PLAYER_UNIT_TYPES, settings.unitType, 'feet'),
    unitDistance: finiteOr(settings.unitDistance, 5, SCENE_RANGES.unitDistance),
    diagonalRule: oneOf(PLAYER_DIAGONAL_RULES, settings.diagonalRule, 'equidistant'),
    snapToGrid: grid?.snapToGrid ?? true,
    coneAngle: isValidConeAngle(cone) ? cone : DEFAULT_CONE_ANGLE,
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
  const definitions = context.resources ?? NO_RESOURCES;
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
    // Atlas 0.5 replaced HP and stress with the collection's resources; the old fields stay null for older players.
    hp: null,
    stress: null,
    resources: character ? projectBars(character, definitions) : [],
    downed: isDowned(token, definitions),
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
