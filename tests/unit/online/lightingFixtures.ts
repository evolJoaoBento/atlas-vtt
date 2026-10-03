import { resolveMeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { exploredMemoryOn } from '../../../src/app/lighting/sceneLightingOptions';
import { heldForSight } from '../../../src/app/lighting/sightOnDrop';
import { tokenPerception, type PlayerLighting } from '../../../src/app/pixi/lighting/playerLightingLayers';
import { SceneModelBuilder, SceneSpots } from '../../../src/app/pixi/lighting/sceneModel';
import type { ExploredImage } from '../../../src/app/online/scene/darknessRaster';
import { darknessFor, lightingFrame, type LightingFrame } from '../../../src/app/online/scene/LiveLighting';
import type { MapSize, ScenePoint } from '../../../src/app/online/scene/sceneTypes';
import { FogCoverage } from '../../../src/app/online/scene/FogCoverage';
import { projectForPlayers, type ProjectedState } from '../../../src/app/online/scene/projectForPlayers';
import { createProjectionMemo, projectFog } from '../../../src/app/online/scene/projectRecords';
import type { PlayerViewRules } from '../../../src/app/online/scene/playerViewRules';
import type { PlayerScene } from '../../../src/app/online/scene/sceneTypes';
import type { GridState } from '../../../src/app/services/MapPersistence';
import type { ViewAtlasState } from '../../../src/app/storeFactory';
import type { Character } from '../../../src/app/types';
import { createDefaultInitiativeState } from '../../../src/app/types/initiativeTypes';
import { DEFAULT_SCENE_LIGHTING, type SceneLighting } from '../../../src/app/types/lightingTypes';
import type { LightSource } from '../../../src/app/types/lightingTypes';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { fakeAssetIds } from './sceneFixtures';
import type { SightRules } from '../../../src/app/vision/sightRules';

export type LitState = Pick<ViewAtlasState, 'objects' | 'lighting' | 'grid' | 'heldTokens'>;

/**
 * The players' lighting as the GM's lighting view works it out from the store (`LightingRenderer`:
 * `SceneModelBuilder`, `SceneSpots`, then `tokenPerception` as `playerTokenSight` calls it), with
 * upstream's own CPU code and no GPU. Undefined while the scene is unlit, as the view gives it.
 */
export function playerLightingOf(state: LitState, map: MapSize, rules?: SightRules): PlayerLighting | undefined {
  if (!state.lighting.enabled) return undefined;
  const measurement = () => resolveMeasurementSettings(undefined, state.grid);
  const sightRules = rules && ((): SightRules => rules);
  const { model } = new SceneModelBuilder().update(state, map, measurement, sightRules);
  const spots = new SceneSpots().update(model, state, measurement, sightRules);
  const perception = tokenPerception(model.sight, model.ambient, model.reaches, state.objects.tokens, {
    conditions: rules?.conditions ?? [], held: heldForSight(state),
  });
  return {
    ready: true, perception, sight: model.sight, ambient: model.ambient, reaches: model.reaches, spots,
    showsExplored: exploredMemoryOn(state.lighting),
  };
}

/** What the broadcaster hands the projection for `state`, without the throttle; null while unlit. */
export function lightingFrameOf(state: LitState, map: MapSize, explored: ExploredImage | null = null, rules?: SightRules): LightingFrame | null {
  const lighting = playerLightingOf(state, map, rules);
  return lighting ? lightingFrame(lighting, darknessFor(lighting, explored, map)) : null;
}

export function wall(id: string, p1: ScenePoint, p2: ScenePoint): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1, p2 };
}

/** A light dim to `dim` feet (bright to half of it). */
export function light(id: string, x: number, y: number, dim = 10): LightSource {
  return { id, kind: 'light', x, y, emission: { bright: dim / 2, dim, color: '#ffcc88', intensity: 1, animation: 'none' } };
}

/** Explored memory over the whole map, explored where `explored(x, y)` says (in map pixels), one texel per 10 px. */
export function exploredImage(map: MapSize, explored: (x: number, y: number) => boolean): ExploredImage {
  const width = Math.ceil(map.width / 10);
  const height = Math.ceil(map.height / 10);
  const coverage = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) coverage[y * width + x] = explored(x * 10 + 5, y * 10 + 5) ? 255 : 0;
  }
  return { width, height, coverage };
}

export const MAP = { width: 1000, height: 800 };
const RULES: PlayerViewRules = { showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true };
const GRID: GridState = { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 };
const assets = fakeAssetIds();

export type Scene = ProjectedState & LitState & { exploredMask: string | null };

export function character(id: string, x: number, y: number, overrides: Partial<Character> = {}): Character {
  return { id, kind: 'character', x, y, imagePath: `art/${id}.png`, name: id, size: 1, ...overrides };
}

/** A lit scene: the hero sees (vision on), the others do not. */
export function scene(lighting: Partial<SceneLighting>, objects: Partial<Scene['objects']> = {}): Scene {
  return {
    background: 'maps/cave.png',
    grid: GRID,
    objects: {
      tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }) },
      fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, lightZones: {}, audios: {},
      ...objects,
    },
    widgetSettings: { widgets: {}, globalVisible: true, position: 'top', scale: 1 },
    widgetValues: {},
    initiative: createDefaultInitiativeState(),
    initiativeTrackerOpen: false,
    lighting: { ...DEFAULT_SCENE_LIGHTING, enabled: true, ...lighting },
    heldTokens: {},
    exploredMask: null,
  };
}

/** The projection as the broadcaster makes it: the coverage holds the darkness of `lighting`. */
export function project(state: Scene, lighting: LightingFrame | null): PlayerScene {
  const memo = createProjectionMemo();
  const fog = projectFog(state.objects.fog, memo);
  return projectForPlayers(state, {
    sceneId: 'scene-1', rules: RULES, coverage: FogCoverage.fromPlayerFog(fog, lighting?.darkness.covered ?? []), lighting,
    assets, mapSize: MAP, memo,
  });
}

/** As players get it with the GM's lighting worked out from the store. */
export const projectLit = (state: Scene): PlayerScene => project(state, lightingFrameOf(state, MAP));
