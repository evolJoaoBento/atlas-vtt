import { Graphics, GraphicsContext, type Container, type Renderer } from 'pixi.js';
import { usesCanvasRenderer } from '../pixi/utils/rendererType';
import type { GridLineType, GridPath } from './gridLineStyle';

/** The grid's lines as the GM set them; how wide they are drawn follows each render. */
export interface GridLineLook {
  lineType: GridLineType;
  /** Width in map pixels. */
  lineWidth: number;
  color: number;
  alpha: number;
  /** Arm length of a dotted grid's vertex markers, in map pixels. */
  markerArm: number;
  /** Adds the grid's lines to `path`; a dotted grid's markers are `thickness` thick with arms `arm` long. */
  trace(path: GridPath, thickness: number, arm: number): void;
}

/** How the lines are drawn for one render. */
export interface LineDrawing {
  /** Width in map pixels, or `pixel`: one device pixel at any scale (`pixelLine`). */
  width: number | 'pixel';
  /** Arm length of dotted markers, in map pixels. */
  arm: number;
  /** Opacity on top of the lines' own, so a widened line keeps the ink its own width gives it. */
  ink: number;
}

/**
 * How lines `lineWidth` map pixels wide are drawn where a map pixel spans `devicePixelsPerUnit`
 * device pixels. A line thinner than a device pixel falls between pixel centres where the render
 * has no samples (no MSAA, the plain back buffer at resolution 2), and with a cell size that is no
 * whole number some lines vanished at one zoom and others at the next. Such lines are drawn one
 * device pixel wide and as much fainter as they were thinner. A dotted grid's markers are fills,
 * which have no such stroke: they widen in powers of two, so one drawing serves zooms within a
 * factor of two, and their arms are never shorter than they are thick.
 */
export function lineDrawing(
  { lineType, lineWidth, markerArm }: Pick<GridLineLook, 'lineType' | 'lineWidth' | 'markerArm'>,
  devicePixelsPerUnit: number,
): LineDrawing {
  const deviceWidth = lineWidth * devicePixelsPerUnit;
  if (!(deviceWidth > 0 && deviceWidth < 1)) return { width: lineWidth, arm: markerArm, ink: 1 };
  if (lineType !== 'dotted') return { width: 'pixel', arm: markerArm, ink: deviceWidth };
  const width = lineWidth * 2 ** Math.ceil(Math.log2(1 / deviceWidth));
  const arm = Math.max(markerArm, width);
  return { width, arm, ink: (lineWidth * markerArm) / (width * arm) };
}

/** The GM's zoom, a frozen player camera and a thumbnail may each want their own drawing. */
const KEPT_DRAWINGS = 4;

/**
 * The grid's lines, drawn for the scale of whichever render draws them: the GM's canvas, the
 * player frame from its own camera, a thumbnail. Each render picks its drawing just before it
 * draws (`onRender`), so every way of changing the zoom or the display's pixel ratio is followed,
 * and a drawing once built is kept, so zooming only changes the lines' opacity.
 */
export class GridLines {
  readonly graphics: Graphics;
  private readonly blank = new GraphicsContext();
  /** Built drawings by width and arm, the most recently used last. */
  private readonly drawings = new Map<string, GraphicsContext>();

  constructor(private readonly look: GridLineLook) {
    this.graphics = new Graphics({ context: this.blank, label: 'grid-lines' });
    this.graphics.onRender = (renderer): void => this.follow(renderer);
    this.graphics.once('destroyed', () => this.release());
  }

  private follow(renderer: Renderer): void {
    const scale = renderScale(this.graphics);
    if (scale === null) return;
    // Canvas 2D antialiases every stroke, so no line vanishes there: they are drawn as set
    const devicePixelsPerUnit = usesCanvasRenderer(renderer) ? Infinity : scale * renderer.renderTarget.renderTarget.resolution;
    const drawing = lineDrawing(this.look, devicePixelsPerUnit);
    this.graphics.context = this.contextFor(drawing);
    this.graphics.alpha = drawing.ink;
  }

  private contextFor(drawing: LineDrawing): GraphicsContext {
    const key = `${drawing.width}:${drawing.arm}`;
    const kept = this.drawings.get(key);
    this.drawings.delete(key);
    const context = kept ?? this.draw(drawing);
    this.drawings.set(key, context);
    for (const [oldKey, old] of this.drawings) {
      if (this.drawings.size <= KEPT_DRAWINGS) break;
      this.drawings.delete(oldKey);
      old.destroy();
    }
    return context;
  }

  private draw({ width, arm }: LineDrawing): GraphicsContext {
    const { lineType, color, alpha } = this.look;
    const context = new GraphicsContext();
    if (width === 'pixel') {
      this.look.trace(context, 1, arm);
      return context.stroke({ color, alpha, pixelLine: true });
    }
    this.look.trace(context, width, arm);
    return lineType === 'dotted'
      ? context.fill({ color, alpha })
      : context.stroke({ width, color, alpha, alignment: 0, cap: 'round', join: 'miter' });
  }

  private release(): void {
    for (const context of this.drawings.values()) context.destroy();
    this.drawings.clear();
    this.blank.destroy();
  }
}

/**
 * Map pixels to render-target pixels of `node` in the render under way, or null when it is not
 * drawn there. Ancestors give their scale; the render's root gives its local transform, which is
 * the transform a render was handed (a thumbnail's frame) and the stage's own otherwise. Transforms
 * are not updated yet when `onRender` runs, so world transforms would be a render behind.
 */
function renderScale(node: Container): number | null {
  let scale = 1;
  let current = node;
  while (current.parent) {
    if (!current.visible || !current.renderable) return null;
    scale *= Math.abs(current.scale.x);
    current = current.parent;
  }
  const { a, b } = current.localTransform;
  return scale * Math.hypot(a, b);
}
