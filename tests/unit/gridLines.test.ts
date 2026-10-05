import { Container, GraphicsContext, type Renderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { GridLines, lineDrawing, type GridLineLook } from '../../src/app/grid/gridLines';
import type { GridLineType } from '../../src/app/grid/gridLineStyle';

function look(lineType: GridLineType, traced: number[] = []): GridLineLook {
  return {
    lineType, lineWidth: 1, color: 0, alpha: 0.8, markerArm: 5,
    trace: (path, thickness) => {
      traced.push(thickness);
      path.moveTo(0, 0).lineTo(100, 0);
    },
  };
}

function webgl(resolution: number): Renderer {
  return { name: 'webgl', renderTarget: { renderTarget: { resolution } } } as unknown as Renderer;
}

describe('lineDrawing', () => {
  it('keeps lines at least a device pixel wide as they are', () => {
    expect(lineDrawing(look('solid'), 1)).toEqual({ width: 1, arm: 5, ink: 1 });
    expect(lineDrawing({ ...look('dashed'), lineWidth: 2 }, 0.5)).toEqual({ width: 2, arm: 5, ink: 1 });
  });

  it('draws thinner lines one device pixel wide and as much fainter', () => {
    expect(lineDrawing(look('solid'), 0.25)).toEqual({ width: 'pixel', arm: 5, ink: 0.25 });
    expect(lineDrawing(look('dashed'), 0.1)).toEqual({ width: 'pixel', arm: 5, ink: 0.1 });
  });

  it('widens dotted markers in powers of two, never thinner than a device pixel, keeping their ink', () => {
    expect(lineDrawing(look('dotted'), 0.5)).toEqual({ width: 2, arm: 5, ink: 0.5 });
    expect(lineDrawing(look('dotted'), 0.3)).toEqual({ width: 4, arm: 5, ink: 0.25 });
    // One drawing serves every zoom up to twice as far out
    expect(lineDrawing(look('dotted'), 0.26).width).toBe(4);
    // Arms never shorter than the markers are thick
    expect(lineDrawing(look('dotted'), 0.1)).toEqual({ width: 16, arm: 16, ink: 5 / (16 * 16) });
    for (let scale = 0.01; scale < 1; scale *= 1.07) {
      const { width } = lineDrawing(look('dotted'), scale);
      expect(Number(width) * scale).toBeGreaterThanOrEqual(1);
      expect(Number(width) * scale).toBeLessThan(2);
    }
  });

  it('draws as set where the scale is unknown', () => {
    expect(lineDrawing(look('solid'), 0)).toEqual({ width: 1, arm: 5, ink: 1 });
    expect(lineDrawing(look('solid'), Number.NaN)).toEqual({ width: 1, arm: 5, ink: 1 });
  });
});

describe('GridLines', () => {
  function mounted(lineType: GridLineType, traced: number[] = []): { lines: GridLines; camera: Container; render: (resolution?: number) => void } {
    const stage = new Container();
    const camera = stage.addChild(new Container());
    const lines = new GridLines(look(lineType, traced));
    camera.addChild(lines.graphics);
    return { lines, camera, render: (resolution = 1) => lines.graphics.onRender!(webgl(resolution)) };
  }

  it('builds each drawing once and only changes the opacity while zooming', () => {
    const traced: number[] = [];
    const { lines, camera, render } = mounted('solid', traced);
    const contexts = new Set<GraphicsContext>();
    for (let zoom = 0.5; zoom > 0.1; zoom *= 0.97) {
      camera.scale.set(zoom);
      render();
      contexts.add(lines.graphics.context);
      expect(lines.graphics.alpha).toBeCloseTo(zoom);
    }
    camera.scale.set(2);
    render();
    expect(lines.graphics.alpha).toBe(1);
    camera.scale.set(0.2);
    render();
    expect(contexts.size).toBe(1);
    expect(traced).toHaveLength(2);
  });

  it('follows the pixel ratio of the render', () => {
    const { lines, camera, render } = mounted('solid');
    camera.scale.set(0.4);
    render(2);
    expect(lines.graphics.alpha).toBeCloseTo(0.8);
    render(1);
    expect(lines.graphics.alpha).toBeCloseTo(0.4);
  });

  it('draws lines as set on the Canvas renderer, which antialiases them', () => {
    const { lines, camera } = mounted('solid');
    camera.scale.set(0.1);
    lines.graphics.onRender!({ name: 'canvas' } as unknown as Renderer);
    expect(lines.graphics.alpha).toBe(1);
    expect(lines.graphics.context.instructions[0]).toMatchObject({ action: 'stroke', data: { style: { width: 1, pixelLine: false } } });
  });

  it('leaves a grid that is not drawn alone', () => {
    const traced: number[] = [];
    const { lines, camera, render } = mounted('dotted', traced);
    camera.visible = false;
    camera.scale.set(0.1);
    render();
    expect(traced).toEqual([]);
    expect(lines.graphics.alpha).toBe(1);
  });

  it('keeps a few drawings and frees the rest with itself', () => {
    const { lines, camera, render } = mounted('dotted');
    const built: GraphicsContext[] = [];
    for (const zoom of [1, 0.5, 0.25, 0.125, 0.06, 0.03]) {
      camera.scale.set(zoom);
      render();
      built.push(lines.graphics.context);
    }
    expect(built.filter((context) => context.destroyed)).toEqual([built[0], built[1]]);
    lines.graphics.destroy({ children: true, context: true });
    expect(built.every((context) => context.destroyed)).toBe(true);
  });
});
