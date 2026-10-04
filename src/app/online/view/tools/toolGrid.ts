/**
 * The grid the player's measuring tools use. It is the grid players see, snapped to cell centres
 * like the GM's measure tool (`cellCenterAt`); a dragged token's ruler ends where the GM's drop
 * puts a token of its size (`snapTokenCenter`: where cells meet for Large and Gargantuan). Without one, it is a square grid of the map's cell size,
 * never snapped by the measure tool, since the grid's offset is not sent; the drag ruler snaps there when the GM's snap-to-grid is on. Distances are labelled with the GM's
 * measurement settings, as Atlas's ruler labels them, and cones open by the GM's cone angle. Shared with the web page.
 */
import { cellCenterAt, type GridGeometry } from '../../../grid/gridDistance';
import { snapTokenCenter } from '../../../grid/gridPlacement';
import { dragRulerLabel } from '../../../pixi/token-renderer/dragRulerPath';
import type { PlayerScene, ScenePoint } from '../../scene/sceneTypes';

export interface ToolGrid {
  geometry: GridGeometry;
  /** Where a measured point lands. */
  snap(point: ScenePoint): ScenePoint;
  /** Where a drag ruler point of a token of `tokenSize` lands: the GM's snap-to-grid decides, as for a dropped token, even if the grid is hidden. */
  snapDrag(point: ScenePoint, tokenSize: number): ScenePoint;
  /** The distance along `points`, e.g. "30ft" or a range band's name. */
  label(points: readonly ScenePoint[]): string;
  /** A cone's full opening in radians: the GM's measure tool's, so the game system's. */
  coneOpening: number;
}

export function toolGridOf(scene: PlayerScene): ToolGrid {
  const grid = scene.grid;
  const geometry: GridGeometry = grid
    ? { type: grid.type, size: grid.size, offsetX: grid.offsetX, offsetY: grid.offsetY }
    : { type: 'square', size: scene.map.cellSize, offsetX: 0, offsetY: 0 };
  return {
    geometry,
    snap: (point) => (grid ? cellCenterAt(geometry, point) : { x: point.x, y: point.y }),
    snapDrag: (point, tokenSize) => (scene.measurement.snapToGrid
      ? snapTokenCenter(point, tokenSize, geometry.type, geometry.size, (cell) => cellCenterAt(geometry, cell))
      : { x: point.x, y: point.y }),
    label: (points) => dragRulerLabel(geometry, points, scene.measurement),
    coneOpening: (scene.measurement.coneAngle * Math.PI) / 180,
  };
}
