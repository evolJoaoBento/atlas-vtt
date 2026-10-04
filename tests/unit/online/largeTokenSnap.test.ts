import { describe, expect, it } from 'vitest';
import { snapDroppedToken } from '../../../src/app/clipboard/mapObjectPlacement';
import { GridSystem, type GridOptions, type GridType } from '../../../src/app/grid/GridSystem';
import { axialToPixel, createHexLayout, hexCircumradius, nearestHexCenter, pixelToAxial } from '../../../src/app/grid/hexGeometry';
import type { GridState } from '../../../src/app/services/MapPersistence';
import { toolGridOf } from '../../../src/app/online/view/tools/toolGrid';
import { playerScene } from './sceneFixtures';

/**
 * Online players' token moves snap as the GM's drag does (`GridSystem.snapTokenCenter`, upstream #207):
 * the GM's check of a player's drop (`snapDroppedToken`) and the player's drag ruler on the web page
 * (`ToolGrid.snapDrag`) land a token of each size on the same point. The Online scene in Obsidian drags
 * with Atlas's own `InteractionController`, so it snaps by `GridSystem` itself.
 */
const SIZE = 70;
const OFFSET = { x: 13, y: 29 };
const TYPES: readonly GridType[] = ['square', 'hex-vertical', 'hex-horizontal'];
const TOKEN_SIZES = [1, 1.5, 2, 2.5] as const;
const POINTS = [{ x: 300, y: 150 }, { x: 517.3, y: 402.9 }, { x: -40, y: 12 }, { x: 999, y: 1001 }];

/** The GM's own drag: `GridSystem.snapTokenCenter` on a grid with these options, without a canvas. */
function gmSnap(type: GridType, point: { x: number; y: number }, tokenSize: number): { x: number; y: number } {
  const options: GridOptions = { type, size: SIZE, offsetX: OFFSET.x, offsetY: OFFSET.y, color: 0, alpha: 1, enabled: true };
  const grid = Object.create(GridSystem.prototype) as GridSystem & { options: GridOptions };
  grid.options = options;
  return grid.snapTokenCenter(point.x, point.y, tokenSize);
}

function gridState(type: GridType): GridState {
  return { enabled: true, visible: true, type, size: SIZE, offsetX: OFFSET.x, offsetY: OFFSET.y, opacity: 1, snapToGrid: true };
}

function toolGrid(type: GridType) {
  const base = playerScene();
  return toolGridOf({ ...base, grid: { ...base.grid!, type, size: SIZE, offsetX: OFFSET.x, offsetY: OFFSET.y } });
}

describe("online token moves snap as the GM's drag", () => {
  it.each(TYPES)('lands every token size on the same point on the GM and on the page (%s)', (type) => {
    for (const tokenSize of TOKEN_SIZES) {
      for (const point of POINTS) {
        const gm = gmSnap(type, point, tokenSize);
        const dropped = snapDroppedToken(gridState(type), point, tokenSize);
        const ruler = toolGrid(type).snapDrag(point, tokenSize);
        expect(dropped.x).toBeCloseTo(gm.x, 6);
        expect(dropped.y).toBeCloseTo(gm.y, 6);
        expect(ruler.x).toBeCloseTo(gm.x, 6);
        expect(ruler.y).toBeCloseTo(gm.y, 6);
      }
    }
  });

  it('puts a Large token on a square grid where four cells meet', () => {
    for (const point of POINTS) {
      const snapped = snapDroppedToken(gridState('square'), point, 1.5);
      expect((snapped.x - OFFSET.x) / SIZE).toBeCloseTo(Math.round((snapped.x - OFFSET.x) / SIZE), 6);
      expect((snapped.y - OFFSET.y) / SIZE).toBeCloseTo(Math.round((snapped.y - OFFSET.y) / SIZE), 6);
      expect(toolGrid('square').snapDrag(point, 1.5)).toEqual(snapped);
    }
    // A Medium or Huge one stays on a cell's centre.
    expect(snapDroppedToken(gridState('square'), { x: 300, y: 150 }, 1)).toEqual({ x: 328, y: 134 });
    expect(snapDroppedToken(gridState('square'), { x: 300, y: 150 }, 2)).toEqual({ x: 328, y: 134 });
  });

  it.each(['hex-vertical', 'hex-horizontal'] as const)('puts a Large token on a hex grid on a corner three hexes share (%s)', (type) => {
    const layout = createHexLayout(type, SIZE, OFFSET.x, OFFSET.y);
    for (const point of POINTS) {
      const snapped = toolGrid(type).snapDrag(point, 1.5);
      const around = pixelToAxial(layout, snapped);
      // The three hexes nearest the point are all one circumradius from it: it is their shared vertex.
      const distances = [-1, 0, 1].flatMap((dq) => [-1, 0, 1].map((dr) => axialToPixel(layout, { q: around.q + dq, r: around.r + dr })))
        .map((center) => Math.hypot(center.x - snapped.x, center.y - snapped.y))
        .sort((a, b) => a - b);
      for (const distance of distances.slice(0, 3)) expect(distance).toBeCloseTo(hexCircumradius(SIZE), 6);
      expect(distances[3]!).toBeGreaterThan(hexCircumradius(SIZE) + 1);
    }
    // A Huge one stays on a hex.
    expect(toolGrid(type).snapDrag({ x: 300, y: 150 }, 2)).toEqual(nearestHexCenter(layout, { x: 300, y: 150 }));
  });

  it('follows the snap-to-grid setting the GM sends, for every size', () => {
    const base = playerScene();
    const free = toolGridOf({ ...base, measurement: { ...base.measurement, snapToGrid: false } });
    expect(free.snapDrag({ x: 300.5, y: 150.25 }, 1.5)).toEqual({ x: 300.5, y: 150.25 });
    expect(snapDroppedToken({ ...gridState('square'), snapToGrid: false }, { x: 300.5, y: 150.25 }, 1.5)).toEqual({ x: 300.5, y: 150.25 });
  });

  it('measures from cell centres whatever the token: the measure tool is not a drag', () => {
    expect(toolGrid('square').snap({ x: 300, y: 150 })).toEqual(gmSnap('square', { x: 300, y: 150 }, 1));
  });
});
