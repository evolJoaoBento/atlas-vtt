import { describe, expect, it } from 'vitest';
import { snapDroppedToken } from '../../../src/app/clipboard/mapObjectPlacement';
import { GridSystem, type GridOptions } from '../../../src/app/grid/GridSystem';
import { toGridOptions } from '../../../src/app/grid/gridStateOptions';
import { atlasGrid } from '../../../src/app/online/obsidian/playerSceneToAtlasState';
import { FogCoverage } from '../../../src/app/online/scene/FogCoverage';
import type { PlayerViewRules } from '../../../src/app/online/scene/playerViewRules';
import { projectForPlayers, type ProjectedState } from '../../../src/app/online/scene/projectForPlayers';
import { createProjectionMemo } from '../../../src/app/online/scene/projectRecords';
import type { PlayerScene } from '../../../src/app/online/scene/sceneTypes';
import { isPlayerSceneBody } from '../../../src/app/online/scene/sceneValidation';
import { toolGridOf } from '../../../src/app/online/view/tools/toolGrid';
import type { GridState } from '../../../src/app/services/MapPersistence';
import { createDefaultInitiativeState } from '../../../src/app/types/initiativeTypes';
import { fakeAssetIds } from './sceneFixtures';

/**
 * A grid players do not see (hidden, switched off, or kept from them by the player view rules) still
 * decides where the GM's check puts a dropped token (`snapDroppedToken`). The join page's drag ruler and
 * the Online scene's own drag and resnap must land on that same point, not on a square grid at offset 0.
 */
const ALL_ON: PlayerViewRules = { showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true };
const POINTS = [{ x: 300, y: 150 }, { x: 517.3, y: 402.9 }, { x: 33, y: 760 }];
const SIZES = [1, 1.5, 2.5] as const;

function gmState(grid: GridState | null): ProjectedState {
  return {
    background: 'maps/lair.png',
    grid,
    objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, audios: {} },
    widgetSettings: { widgets: {}, globalVisible: true, position: 'top', scale: 1 },
    widgetValues: {},
    initiative: createDefaultInitiativeState(),
    initiativeTrackerOpen: false,
  };
}

function project(state: ProjectedState, rules: PlayerViewRules = ALL_ON): PlayerScene {
  return projectForPlayers(state, {
    sceneId: 'scene-1', rules, coverage: FogCoverage.EMPTY, assets: fakeAssetIds(),
    mapSize: { width: 1000, height: 800 }, memo: createProjectionMemo(),
  });
}

/** Where the Online scene's Atlas drag puts a token: `GridSystem.snapTokenCenter` over the store's grid, while it snaps. */
function onlineSceneSnap(scene: PlayerScene, point: { x: number; y: number }, size: number): { x: number; y: number } {
  const grid = atlasGrid(scene);
  if (!(grid.snapToGrid ?? true)) return point;
  const system = Object.create(GridSystem.prototype) as GridSystem & { options: GridOptions };
  system.options = toGridOptions(grid);
  return system.snapTokenCenter(point.x, point.y, size);
}

const HIDDEN: ReadonlyArray<{ name: string; grid: GridState; rules?: PlayerViewRules }> = [
  { name: 'a hidden square grid with an offset', grid: { enabled: true, visible: false, type: 'square', size: 70, offsetX: 23, offsetY: 41, opacity: 1 } },
  { name: 'a switched-off flat hex grid', grid: { enabled: false, type: 'hex-vertical', size: 64, offsetX: 10, offsetY: 7, opacity: 1 } },
  {
    name: 'a pointy hex grid kept from players',
    grid: { enabled: true, visible: true, type: 'hex-horizontal', size: 64, offsetX: -5, offsetY: 30, opacity: 1 },
    rules: { ...ALL_ON, showGrid: false },
  },
];

describe('snapping on a grid players do not see', () => {
  it.each(HIDDEN)('lands the GM check, the page ruler and the Online scene on one point: $name', ({ grid, rules }) => {
    const scene = project(gmState(grid), rules);
    expect(scene.grid).toBeNull();
    const { fog: _fog, drawings: _drawings, ...body } = scene;
    expect(isPlayerSceneBody(body)).toBe(true);
    // The Online scene keeps the grid hidden but lays it where the GM's is.
    expect(atlasGrid(scene)).toMatchObject({ visible: false, type: grid.type, size: grid.size, offsetX: grid.offsetX, offsetY: grid.offsetY });
    for (const size of SIZES) {
      for (const point of POINTS) {
        const gm = snapDroppedToken(grid, point, size);
        const ruler = toolGridOf(scene).snapDrag(point, size);
        const online = onlineSceneSnap(scene, point, size);
        expect(ruler.x).toBeCloseTo(gm.x, 6);
        expect(ruler.y).toBeCloseTo(gm.y, 6);
        expect(online.x).toBeCloseTo(gm.x, 6);
        expect(online.y).toBeCloseTo(gm.y, 6);
      }
    }
  });

  it('snaps nowhere on a map without a grid, as the GM does not', () => {
    const scene = project(gmState(null));
    expect(scene.measurement.snapGrid).toBeNull();
    const point = { x: 301.5, y: 149.25 };
    expect(snapDroppedToken(null, point, 1.5)).toEqual(point);
    expect(toolGridOf(scene).snapDrag(point, 1.5)).toEqual(point);
    expect(atlasGrid(scene)).toMatchObject({ visible: false, snapToGrid: false, size: scene.map.cellSize });
    expect(onlineSceneSnap(scene, point, 1.5)).toEqual(point);
  });

  it('still snaps to the grid players see, or a square of the map cell, for a GM before the snap grid was sent', () => {
    const shown = project(gmState({ enabled: true, visible: true, type: 'hex-vertical', size: 64, offsetX: 10, offsetY: 7, opacity: 1 }));
    const { snapGrid: _snap, ...older } = shown.measurement;
    const olderShown: PlayerScene = { ...shown, measurement: older };
    expect(toolGridOf(olderShown).snapDrag({ x: 300, y: 150 }, 1)).toEqual(toolGridOf(shown).snapDrag({ x: 300, y: 150 }, 1));
    const olderHidden: PlayerScene = { ...olderShown, grid: null };
    expect(toolGridOf(olderHidden).snapDrag({ x: 300, y: 150 }, 1)).toEqual({ x: 288, y: 160 });
    expect(atlasGrid(olderHidden)).toMatchObject({ visible: false, type: 'square', offsetX: 0, offsetY: 0 });
  });
});
