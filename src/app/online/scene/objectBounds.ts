/** World-space bounds of scene objects, to test them against the fog coverage. */
import { tokenDiameterInCells } from '../../pixi/token-renderer/tokenSizing';
import { finiteOr, positiveOr, positiveOrNull, textOr, textOrNull } from './coerce';
import type { WorldBounds } from './FogCoverage';
import type { MapSize, PlayerDrawing } from './sceneTypes';

export const DEFAULT_GRID_SIZE = 70;
export const DEFAULT_FONT_SIZE = 16;
/** Widest glyph width and line height in font sizes: the GM side over-estimates text boxes (never smaller than drawn), it does not measure them. */
export const TEXT_CHAR_WIDTH = 1;
/** Code points from here on (CJK, emoji and the like) are drawn up to this many times as wide as `TEXT_CHAR_WIDTH`. */
export const WIDE_CHAR_FROM = 0x2e80;
export const WIDE_CHAR_WIDTH = 2;

/** A line's width in font sizes, counting code points: a wide one counts for `WIDE_CHAR_WIDTH` of them. */
function lineEms(line: string): number {
  let ems = 0;
  for (const char of line) ems += (char.codePointAt(0)! >= WIDE_CHAR_FROM ? WIDE_CHAR_WIDTH : 1) * TEXT_CHAR_WIDTH;
  return ems;
}

/** What `textBounds` reads: a GM record or the text as players are sent it. */
export interface TextBoxSource {
  x?: unknown;
  y?: unknown;
  text?: unknown;
  fontSize?: unknown;
  backgroundColor?: unknown;
  padding?: unknown;
  scale?: unknown;
  width?: unknown;
  height?: unknown;
  rotation?: unknown;
}
export const TEXT_LINE_HEIGHT = 1.25;

/** A token's footprint: its cells (at least one) times the grid size, centred on the token. */
export function tokenBounds(token: { x: number; y: number; size: number }, gridSize: number): WorldBounds {
  const side = Math.max(1, tokenDiameterInCells(token.size)) * gridSize;
  return { x: token.x - side / 2, y: token.y - side / 2, width: side, height: side };
}

/**
 * A text's estimated box, centred on its position like `TextRenderer` draws it.
 * A rotated text gets a square of the box's diagonal, which holds it at any angle.
 */
export function textBounds(text: TextBoxSource): WorldBounds {
  const fontSize = positiveOr(text.fontSize, DEFAULT_FONT_SIZE);
  // `TextRenderer` draws a background with `padding || 8`, and none without one.
  const hasBackground = textOrNull(text.backgroundColor) !== null;
  const padding = hasBackground ? Math.max(0, finiteOr(text.padding, 0)) || 8 : Math.max(0, finiteOr(text.padding, 0));
  const scale = positiveOr(text.scale, 1);
  const lines = textOr(text.text, '').split('\n');
  const longest = lines.reduce((max, line) => Math.max(max, lineEms(line)), 1);
  const width = (Math.max(positiveOrNull(text.width) ?? 0, longest * fontSize * TEXT_CHAR_WIDTH) + 2 * padding) * scale;
  const height = (Math.max(positiveOrNull(text.height) ?? 0, lines.length * fontSize * TEXT_LINE_HEIGHT) + 2 * padding) * scale;
  const rotated = finiteOr(text.rotation, 0) % 360 !== 0;
  const boxWidth = rotated ? Math.hypot(width, height) : width;
  const boxHeight = rotated ? boxWidth : height;
  const x = finiteOr(text.x, 0);
  const y = finiteOr(text.y, 0);
  return { x: x - boxWidth / 2, y: y - boxHeight / 2, width: boxWidth, height: boxHeight };
}

/** The bounds of a drawing's points, grown by its full width on every side. */
export function drawingBounds(drawing: Pick<PlayerDrawing, 'points' | 'width'>): WorldBounds {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of drawing.points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  const pad = drawing.width;
  return { x: left - pad, y: top - pad, width: right - left + 2 * pad, height: bottom - top + 2 * pad };
}

/**
 * The part of `bounds` inside the map, which is all the fog and the darkness can say anything about; null when the
 * item is hidden outright: a map of unknown size, bounds that are not finite, or an item wholly outside the map
 * (also one with area that only touches the map's edge from outside; an item with no width or height on the edge is on the map).
 */
export function clipToMap(bounds: WorldBounds, map: MapSize): WorldBounds | null {
  const { width: w, height: h } = map;
  const right = bounds.x + Math.max(0, bounds.width);
  const bottom = bounds.y + Math.max(0, bounds.height);
  if (!(w > 0 && h > 0 && [bounds.x, bounds.y, right, bottom].every(Number.isFinite))) return null;
  if (right < 0 || bottom < 0 || bounds.x > w || bounds.y > h) return null;
  if ((bounds.width > 0 && (right <= 0 || bounds.x >= w)) || (bounds.height > 0 && (bottom <= 0 || bounds.y >= h))) return null;
  const x = Math.max(bounds.x, 0);
  const y = Math.max(bounds.y, 0);
  return { x, y, width: Math.min(right, w) - x, height: Math.min(bottom, h) - y };
}
