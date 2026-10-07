/**
 * Drawing shared by the measure tool and the token drag ruler: the accent path, its point
 * markers and the distance label on a pill, with Graphics. The geometry and style come from
 * the pure `measureGeometry.ts`.
 */

import { Text, type Graphics } from 'pixi.js';
import type { Point } from '../../grid/hexGeometry';
import {
  MEASURE_AREA, MEASURE_LABEL_COLORS, MEASURE_LABEL_FONT_SIZE, MEASURE_PATH_STROKES, MEASURE_POINT, MEASURE_SHADOW, measureLabelBox,
} from './measureGeometry';

/** A polyline with a soft shadow, an accent body and a bright core. */
export function drawMeasurePath(graphics: Graphics, color: number, points: readonly Point[]): void {
  const [first, ...rest] = points;
  if (!first || rest.length === 0) return;
  for (const stroke of MEASURE_PATH_STROKES) {
    graphics.moveTo(first.x, first.y);
    for (const point of rest) graphics.lineTo(point.x, point.y);
    graphics.stroke({ width: stroke.width, color: stroke.shadow ? MEASURE_SHADOW : color, alpha: stroke.alpha });
  }
}

/** Accent dot marking where a measurement starts, turns or ends. */
export function drawMeasurePoint(graphics: Graphics, color: number, point: Point): void {
  const { radius, halo, haloAlpha, fillAlpha, ringInset, ringWidth } = MEASURE_POINT;
  graphics.circle(point.x, point.y, radius + halo).fill({ color: MEASURE_SHADOW, alpha: haloAlpha });
  graphics.circle(point.x, point.y, radius).fill({ color, alpha: fillAlpha });
  graphics.circle(point.x, point.y, radius - ringInset).stroke({ width: ringWidth, color, alpha: 1 });
}

/** A circular area around `center`: a translucent fill, an accent outline and a bright inner ring. */
export function drawMeasureCircle(graphics: Graphics, color: number, center: Point, radius: number): void {
  const { fillAlpha, strokeWidth, strokeAlpha, highlightWidth, highlightInset } = MEASURE_AREA;
  graphics.circle(center.x, center.y, radius).fill({ color, alpha: fillAlpha });
  graphics.circle(center.x, center.y, radius).stroke({ width: strokeWidth, color, alpha: strokeAlpha });
  graphics.circle(center.x, center.y, Math.max(0, radius - highlightInset)).stroke({ width: highlightWidth, color, alpha: 1 });
}

export function createMeasureLabelText(): Text {
  const text = new Text({ text: '', style: { fontSize: MEASURE_LABEL_FONT_SIZE, fill: 0xffffff, fontWeight: 'normal' } });
  text.eventMode = 'none';
  text.anchor.set(0.5);
  return text;
}

/** Centres `text` on `center` and draws its theme-coloured pill into `pill`. */
export function drawMeasureLabel(pill: Graphics, text: Text, center: Point, viewportScale: number): void {
  text.position.set(center.x, center.y);
  const bounds = text.getLocalBounds();
  const box = measureLabelBox(bounds.width * text.scale.x, bounds.height * text.scale.y, center, viewportScale);
  const theme = document.body.classList.contains('theme-dark') ? MEASURE_LABEL_COLORS.dark : MEASURE_LABEL_COLORS.light;
  pill.clear();
  pill.roundRect(box.x, box.y, box.width, box.height, box.radius)
    .fill({ color: theme.fill, alpha: MEASURE_LABEL_COLORS.fillAlpha })
    .stroke({ width: box.strokeWidth, color: theme.stroke, alpha: theme.strokeAlpha });
}
