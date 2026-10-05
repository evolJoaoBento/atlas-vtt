/**
 * Where the fog of war surely is not, on the map: the positive counterpart of `FogCoverage` (which
 * knows where it surely is). An item reaches players only if every cell its in-map bounds touch is
 * surely revealed, so a cell the replay cannot vouch for (the partial strip at the edge of a map whose
 * size is not a multiple of the cell, a cell a fogging op only touches) counts as fogged.
 *
 * It is the same replay as `FogCoverage` with the roles turned round: the grid starts all revealed,
 * a reveal (erase) clears the fog only in the cells it covers whole, and fogging (paint) takes every
 * cell it touches. Everything outside the map is no proof of anything: only the map is on the grid.
 */
import { anyShownTable, shownTable } from './darknessFog';
import { FOG_CELL_SIZE, MAX_BRUSH_CELLS, MAX_FOG_CELLS, type FogShape, type WorldBounds } from './FogCoverage';
import { CLEAR, FOGGED, fillBrush, fillLasso, fillRect, type CellGrid } from './fogRaster';
import type { MapSize } from './sceneTypes';

/** Whether an item may reach players as far as the fog goes; `bounds` are in the map (`clipToMap`). */
export interface RevealCheck {
  /** Every cell the bounds touch is surely revealed: what texts, drawings and pins need, as what is under fog would leak. */
  revealed(bounds: WorldBounds): boolean;
  /** Some cell the bounds overlap is surely revealed: enough for a token, which the player window draws half under the fog. */
  partlyRevealed(bounds: WorldBounds): boolean;
}

/** Nothing is revealed: a map of unknown size. */
export const CLOSED_REVEAL: RevealCheck = { revealed: () => false, partlyRevealed: () => false };

export function revealOf(shapes: readonly FogShape[], map: MapSize): RevealCheck {
  if (!(map.width > 0) || !(map.height > 0)) return CLOSED_REVEAL;
  let cellSize = FOG_CELL_SIZE;
  const widest = Math.max(0, ...shapes.map((shape) => (shape.type === 'brush' && Number.isFinite(shape.radius) ? shape.radius : 0)));
  while ((map.width / cellSize + 2) * (map.height / cellSize + 2) > MAX_FOG_CELLS || widest / cellSize > MAX_BRUSH_CELLS) cellSize *= 2;
  const cols = Math.ceil(map.width / cellSize);
  const rows = Math.ceil(map.height / cellSize);
  // FOGGED here means surely revealed; every cell is, until a fogging op takes it.
  const grid: CellGrid = { cells: new Uint8Array(cols * rows).fill(FOGGED), cols, rows, originX: 0, originY: 0, cellSize };
  for (const shape of shapes) {
    const value = shape.erase ? FOGGED : CLEAR;
    if (shape.type === 'rectangle') {
      const { x, y, width, height } = shape;
      const left = Math.min(x, x + width);
      const right = Math.max(x, x + width);
      const top = Math.min(y, y + height);
      const bottom = Math.max(y, y + height);
      // Queries are clipped to the map, so a reveal that reaches a border of the map covers the partial cell there.
      const reach = shape.erase ? cellSize : 0;
      const l = left <= 0 ? left - reach : left;
      const t = top <= 0 ? top - reach : top;
      const r = right >= map.width ? right + reach : right;
      const b = bottom >= map.height ? bottom + reach : bottom;
      fillRect(grid, l, t, r - l, b - t, value);
    } else if (shape.type === 'brush') {
      fillBrush(grid, shape.points, shape.radius, value);
    } else {
      fillLasso(grid, shape.points, value);
    }
  }
  const dark = new Uint8Array(grid.cells.length);
  for (let i = 0; i < dark.length; i++) dark[i] = grid.cells[i] === FOGGED ? 0 : 1;
  const raster = { cols, rows, cellSize, map, dark };
  return { revealed: shownTable(raster), partlyRevealed: anyShownTable(raster) };
}
