/**
 * Composites FogOperation[] onto an HTML Canvas 2D surface.
 *
 * Each operation is painted in timestamp order. Brush strokes interpolate
 * circles along the point path; lasso fills render a closed polygon; rectangle
 * fills use fillRect.  Erasing is achieved via `destination-out` composite
 * mode (Canvas 2D, not PIXI — avoids PixiJS v8 erase-blend bug #11377).
 *
 * Compositing is sequential, so everything before the latest operation is kept in a second
 * canvas: while those operations stay the same records (a brush stroke under way, a lit scene's
 * darkness that changes on its own), a composite is one copy of it and the latest operation.
 */
import type { FogBounds, FogOperation } from '../../types/fogTypes';
import { renderOperation } from './fogRenderUtils';

export class FogCanvasCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bounds: FogBounds;
  private scale: number;
  /** All operations but the latest, composited, and which records they were. */
  private prefix: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; ops: FogOperation[] } | null = null;

  constructor(bounds: FogBounds, scale = 0.5) {
    this.bounds = bounds;
    this.scale = scale;
    this.canvas = createEl('canvas');
    this.canvas.width = Math.max(1, Math.round(bounds.width * scale));
    this.canvas.height = Math.max(1, Math.round(bounds.height * scale));

    const ctx = this.canvas.getContext('2d', { willReadFrequently: false, alpha: true });
    if (!ctx) throw new Error('Failed to get 2D context for fog compositor');
    this.ctx = ctx;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /** Full re-render from a set of operations (e.g. after undo/redo or map load). */
  compositeAll(ops: FogOperation[]): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const sorted = [...ops].sort((a, b) => a.timestamp - b.timestamp);
    const latest = sorted.pop();
    if (!latest) return;
    const prefix = this.prefixOf(sorted);
    if (prefix) this.ctx.drawImage(prefix, 0, 0);
    renderOperation(this.ctx, latest, this.bounds, this.scale, latest.offsetX ?? 0, latest.offsetY ?? 0);
  }

  /** The composite of `ops`, redrawn only when they are not the records it was drawn from; null for none. */
  private prefixOf(ops: FogOperation[]): HTMLCanvasElement | null {
    if (ops.length === 0) return null;
    const kept = this.prefix;
    if (kept && kept.ops.length === ops.length && kept.ops.every((op, i) => op === ops[i])) return kept.canvas;
    const canvas = kept?.canvas ?? createEl('canvas');
    canvas.width = this.canvas.width;
    canvas.height = this.canvas.height;
    const ctx = kept?.ctx ?? canvas.getContext('2d', { willReadFrequently: false, alpha: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const op of ops) renderOperation(ctx, op, this.bounds, this.scale, op.offsetX ?? 0, op.offsetY ?? 0);
    this.prefix = { canvas, ctx, ops };
    return canvas;
  }

  /** Append a single operation (for live drawing preview). */
  compositeIncremental(op: FogOperation): void {
    renderOperation(this.ctx, op, this.bounds, this.scale, op.offsetX ?? 0, op.offsetY ?? 0);
  }

  /** Recreate canvas when map/bounds change. */
  updateBounds(bounds: FogBounds): void {
    this.bounds = bounds;
    this.dropPrefix();
    this.canvas.width = Math.max(1, Math.round(bounds.width * this.scale));
    this.canvas.height = Math.max(1, Math.round(bounds.height * this.scale));
  }

  /** The underlying HTMLCanvasElement for PIXI texture creation. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getBounds(): FogBounds {
    return this.bounds;
  }

  destroy(): void {
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.dropPrefix();
  }

  private dropPrefix(): void {
    if (this.prefix) {
      this.prefix.canvas.width = 1;
      this.prefix.canvas.height = 1;
    }
    this.prefix = null;
  }
}
