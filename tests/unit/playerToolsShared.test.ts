import type { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { cellCenterAt } from '../../src/app/grid/gridDistance';
import { axialToPixel, createHexLayout, hexCircumradius } from '../../src/app/grid/hexGeometry';
import {
  CONE_ANGLE, coneGeometry, measureLabelAnchor, measureLabelBox, measureLabelFontSize, pathMidpoint,
} from '../../src/app/pixi/measureGeometry';
import { drawMeasurePath, drawMeasurePoint, pathMidpoint as drawingMidpoint } from '../../src/app/pixi/utils/measureDrawing';

/** Records the Graphics calls the measure drawing makes. */
function recordingGraphics(): { graphics: Graphics; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const graphics: Record<string, (...args: unknown[]) => unknown> = {};
  for (const name of ['moveTo', 'lineTo', 'stroke', 'circle', 'fill']) {
    graphics[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
      return graphics;
    };
  }
  return { graphics: graphics as unknown as Graphics, calls };
}

describe('measure geometry', () => {
  it('keeps the drawing module exporting the same midpoint', () => {
    expect(drawingMidpoint).toBe(pathMidpoint);
  });

  it('draws the path as shadow, body and core, and points as halo, disc and ring', () => {
    const { graphics, calls } = recordingGraphics();
    drawMeasurePath(graphics, 0x123456, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(calls.filter(([name]) => name === 'stroke')).toEqual([
      ['stroke', { width: 6, color: 0x000000, alpha: 0.3 }],
      ['stroke', { width: 4, color: 0x123456, alpha: 0.8 }],
      ['stroke', { width: 2, color: 0x123456, alpha: 1 }],
    ]);
    calls.length = 0;
    drawMeasurePoint(graphics, 0x123456, { x: 5, y: 5 });
    expect(calls).toEqual([
      ['circle', 5, 5, 11], ['fill', { color: 0x000000, alpha: 0.3 }],
      ['circle', 5, 5, 8], ['fill', { color: 0x123456, alpha: 0.9 }],
      ['circle', 5, 5, 7], ['stroke', { width: 2, color: 0x123456, alpha: 1 }],
    ]);
  });

  it('opens the cone 90 degrees around the measured direction', () => {
    const cone = coneGeometry({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(cone.radius).toBe(100);
    expect(cone.endAngle - cone.startAngle).toBeCloseTo(CONE_ANGLE);
    expect(cone.left.x).toBeCloseTo(70.71);
    expect(cone.left.y).toBeCloseTo(-70.71);
    expect(cone.right.y).toBeCloseTo(70.71);
  });

  it('opens a cone by the given angle, 60 degrees here', () => {
    const cone = coneGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, Math.PI / 3);
    expect(cone.endAngle - cone.startAngle).toBeCloseTo(Math.PI / 3);
    expect(cone.left.x).toBeCloseTo(86.6);
    expect(cone.left.y).toBeCloseTo(-50);
    expect(cone.right.y).toBeCloseTo(50);
  });

  it('lifts the label a constant screen distance and sizes its pill for the zoom', () => {
    expect(measureLabelAnchor({ x: 0, y: 0 }, { x: 100, y: 100 }, 2)).toEqual({ x: 50, y: 35 });
    expect(measureLabelFontSize(1)).toBe(16);
    expect(measureLabelFontSize(0.1)).toBe(32);
    expect(measureLabelBox(40, 10, { x: 100, y: 100 }, 1)).toEqual({ x: 72, y: 90, width: 56, height: 20, radius: 10, strokeWidth: 0.5 });
  });
});

describe('cellCenterAt', () => {
  it('lands in the middle of the cell holding the point, on square and hex grids', () => {
    const square = { size: 70, offsetX: 5, offsetY: 9, type: 'square' as const };
    expect(cellCenterAt(square, { x: 123, y: 99 })).toEqual({ x: 110, y: 114 });
    expect(cellCenterAt(square, { x: -40, y: 3 })).toEqual({ x: -30, y: -26 });
    expect(cellCenterAt({ size: 70 }, { x: 700, y: 701 })).toEqual({ x: 735, y: 735 });
    for (const type of ['hex-vertical', 'hex-horizontal'] as const) {
      const grid = { size: 70, offsetX: 10, offsetY: 20, type };
      const center = axialToPixel(createHexLayout(type, 70, 10, 20), { q: 3, r: -2 });
      const near = { x: center.x + hexCircumradius(70) * 0.4, y: center.y - hexCircumradius(70) * 0.3 };
      const snapped = cellCenterAt(grid, near);
      expect(snapped.x).toBeCloseTo(center.x);
      expect(snapped.y).toBeCloseTo(center.y);
    }
  });
});
