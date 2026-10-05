/**
 * The darkness of a lit scene as players receive it: one fog paint lasso over every dark
 * cell, so both players' clients draw it as they draw the GM's fog, opaque and above
 * everything. Its outline follows the cell edges, every loop of it oriented alike (dark on
 * the same side), and the loops are joined into one ring by zero-width bridges, each walked
 * there and back: under nonzero (and even-odd) filling only the dark cells are filled.
 */
import type { WorldBounds } from './FogCoverage';
import type { DarknessRaster } from './darknessRaster';
import { SCENE_LIMITS, type PlayerFogOp, type ScenePoint } from './sceneTypes';

/** The darkness's fog id; GM fog ids are random, never this. */
export const DARKNESS_FOG_ID = 'atlas-lighting-darkness';
/** After every GM fog operation (their order is a timestamp), so nothing the GM erased reveals it again. */
export const DARKNESS_ORDER = Number.MAX_SAFE_INTEGER;

export interface Darkness {
  /** The darkness's fog operation, by id; empty when nothing is dark. */
  fog: Readonly<Record<string, PlayerFogOp>>;
  /** The dark area as rectangles, for the GM's coverage of what players cannot see (`FogCoverage`). */
  covered: readonly WorldBounds[];
  /**
   * A positive check: true only when every darkness cell the part of `bounds` inside the map touches
   * (its edges included) is shown per lighting cell (8·2^k px, each sampled at its centre). Anything else is not: a cell dark, a cell not on the raster,
   * bounds that are not finite or lie wholly outside the map. A text or drawing is sent only when this holds,
   * where `covered` only names what is surely dark, and misses the last strip of a map whose size is
   * not a multiple of the fog coverage's cells.
   */
  shown(bounds: WorldBounds): boolean;
}

/** Nothing is shown: for a map of unknown size, or while the view's lighting cannot be read. */
export const CLOSED_DARKNESS: Darkness = { fog: {}, covered: [], shown: () => false };

/** Nothing is dark: every part of the map is shown. */
export const NO_DARKNESS: Darkness = { fog: {}, covered: [], shown: () => true };

export function darknessOf(raster: DarknessRaster): Darkness {
  let grid = raster;
  for (;;) {
    if (!grid.dark.includes(1)) return NO_DARKNESS;
    const points = outline(grid);
    // A finer outline than a fog operation may carry is drawn coarser, never left out.
    if (points.length > SCENE_LIMITS.points) {
      grid = coarser(grid);
      continue;
    }
    const op: PlayerFogOp = { type: 'lasso', erase: false, order: DARKNESS_ORDER, points };
    return { fog: { [DARKNESS_FOG_ID]: op }, covered: rectangles(grid), shown: shownTable(grid) };
  }
}

/** The cells of `grid` the part of `bounds` inside the map touches, edges included; null when there are none or the bounds are unusable. */
function touchedCells({ cols, rows, cellSize, map }: DarknessRaster, bounds: WorldBounds): { c0: number; c1: number; r0: number; r1: number } | null {
  const right = bounds.x + Math.max(0, bounds.width);
  const bottom = bounds.y + Math.max(0, bounds.height);
  if (![bounds.x, bounds.y, right, bottom].every(Number.isFinite)) return null;
  if (right < 0 || bottom < 0 || bounds.x > map.width || bounds.y > map.height) return null;
  const clamp = (value: number, max: number): number => Math.min(Math.max(value, 0), max);
  // An edge on a cell boundary touches the next cell as well: that cell counts.
  const c0 = Math.floor(clamp(bounds.x, map.width) / cellSize);
  const c1 = Math.min(cols - 1, Math.floor(clamp(right, map.width) / cellSize));
  const r0 = Math.floor(clamp(bounds.y, map.height) / cellSize);
  const r1 = Math.min(rows - 1, Math.floor(clamp(bottom, map.height) / cellSize));
  return c0 > c1 || r0 > r1 ? null : { c0, c1, r0, r1 };
}

/** Whether every cell of `grid` that the part of `bounds` inside the map touches is shown (not dark); fail-closed. Scans the cells. */
export function shownByScan(grid: DarknessRaster, bounds: WorldBounds): boolean {
  const cells = touchedCells(grid, bounds);
  if (!cells) return false;
  for (let row = cells.r0; row <= cells.r1; row++) {
    for (let col = cells.c0; col <= cells.c1; col++) {
      if (grid.dark[row * grid.cols + col] !== 0) return false;
    }
  }
  return true;
}

/**
 * The same answer as `shownByScan` in constant time: a summed-area table of the dark cells, built
 * once per darkness, so a lit map with many large texts and drawings costs no scan for each.
 */
export function shownTable(grid: DarknessRaster): (bounds: WorldBounds) => boolean {
  const { cols, rows, dark } = grid;
  const width = cols + 1;
  const sums = new Int32Array(width * (rows + 1));
  for (let row = 0; row < rows; row++) {
    let line = 0;
    for (let col = 0; col < cols; col++) {
      if (dark[row * cols + col] !== 0) line++;
      sums[(row + 1) * width + col + 1] = sums[row * width + col + 1]! + line;
    }
  }
  return (bounds) => {
    const cells = touchedCells(grid, bounds);
    if (!cells) return false;
    const { c0, c1, r0, r1 } = cells;
    return sums[(r1 + 1) * width + c1 + 1]! - sums[r0 * width + c1 + 1]! - sums[(r1 + 1) * width + c0]! + sums[r0 * width + c0]! === 0;
  };
}

/** Half as many cells each way; a cell is dark when any of the cells it holds is. */
function coarser(grid: DarknessRaster): DarknessRaster {
  const cols = Math.ceil(grid.cols / 2);
  const rows = Math.ceil(grid.rows / 2);
  const dark = new Uint8Array(cols * rows);
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.dark[row * grid.cols + col]) dark[(row >> 1) * cols + (col >> 1)] = 1;
    }
  }
  return { cols, rows, cellSize: grid.cellSize * 2, map: grid.map, dark };
}

/** The boundary of the dark cells as one ring of world points, clipped to the map. */
function outline(grid: DarknessRaster): ScenePoint[] {
  const loops = traceLoops(grid);
  const [first, ...others] = loops;
  if (!first) return [];
  const ring = [...first, first[0]!];
  for (const loop of others) ring.push(...loop, loop[0]!, first[0]!);
  const toWorld = ([col, row]: Vertex): ScenePoint => ({
    x: Math.min(col * grid.cellSize, grid.map.width),
    y: Math.min(row * grid.cellSize, grid.map.height),
  });
  return ring.map(toWorld);
}

type Vertex = readonly [col: number, row: number];

/**
 * Every boundary edge between a dark cell and one that is not (or the map's edge), walked
 * clockwise around the dark cells, chained into closed loops of their corners only.
 */
function traceLoops({ cols, rows, dark }: DarknessRaster): Vertex[][] {
  const width = cols + 1;
  const isDark = (col: number, row: number): boolean => col >= 0 && row >= 0 && col < cols && row < rows && dark[row * cols + col] === 1;
  // Each corner starts at most two edges (where two dark cells touch diagonally).
  const next = new Int32Array(width * (rows + 1) * 2).fill(-1);
  const add = (fromCol: number, fromRow: number, toCol: number, toRow: number): void => {
    const slot = (fromRow * width + fromCol) * 2;
    next[next[slot] === -1 ? slot : slot + 1] = toRow * width + toCol;
  };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!isDark(col, row)) continue;
      if (!isDark(col, row - 1)) add(col, row, col + 1, row);
      if (!isDark(col + 1, row)) add(col + 1, row, col + 1, row + 1);
      if (!isDark(col, row + 1)) add(col + 1, row + 1, col, row + 1);
      if (!isDark(col - 1, row)) add(col, row + 1, col, row);
    }
  }
  const take = (vertex: number): number => {
    const slot = vertex * 2;
    const second = next[slot + 1]!;
    if (second !== -1) {
      next[slot + 1] = -1;
      return second;
    }
    const first = next[slot]!;
    next[slot] = -1;
    return first;
  };
  const loops: Vertex[][] = [];
  for (let start = 0; start < width * (rows + 1); start++) {
    while (next[start * 2] !== -1 || next[start * 2 + 1] !== -1) {
      const walk: number[] = [start];
      for (let at = take(start); at !== start; at = take(at)) walk.push(at);
      loops.push(corners(walk.map((vertex): Vertex => [vertex % width, Math.floor(vertex / width)])));
    }
  }
  return loops;
}

/** The loop without the points where it runs straight on. */
function corners(loop: readonly Vertex[]): Vertex[] {
  return loop.filter((point, index) => {
    const before = loop[(index + loop.length - 1) % loop.length]!;
    const after = loop[(index + 1) % loop.length]!;
    return (point[0] - before[0]) * (after[1] - point[1]) !== (point[1] - before[1]) * (after[0] - point[0]);
  });
}

/** The dark cells as rectangles: runs of each row, joined with the same run of the rows below. */
function rectangles({ cols, rows, cellSize, map, dark }: DarknessRaster): WorldBounds[] {
  const done: WorldBounds[] = [];
  let open = new Map<string, WorldBounds>();
  for (let row = 0; row <= rows; row++) {
    const still = new Map<string, WorldBounds>();
    for (let col = 0; row < rows && col < cols; col++) {
      if (!dark[row * cols + col]) continue;
      const from = col;
      while (col + 1 < cols && dark[row * cols + col + 1]) col++;
      const key = `${from}:${col}`;
      const top = row * cellSize;
      const bottom = Math.min((row + 1) * cellSize, map.height);
      const x = from * cellSize;
      const rect = open.get(key) ?? { x, y: top, width: Math.min((col + 1) * cellSize, map.width) - x, height: 0 };
      rect.height = bottom - rect.y;
      still.set(key, rect);
    }
    for (const [key, rect] of open) if (!still.has(key)) done.push(rect);
    open = still;
  }
  return done;
}
