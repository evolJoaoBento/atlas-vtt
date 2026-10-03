import { Container, Graphics, type Ticker } from 'pixi.js';
import { barDimensions } from '../../../styles/designTokens';
import { resourceColor } from '../../../resources/resourceColors';
import type { VisibleResource } from '../../../resources/resourceTypes';
import { ResourceBarLabel } from '../../ResourceBarLabel';
import { destroyTree } from '../../utils/destroyTree';
import { AnimatedBarFill } from '../AnimatedBarFill';
import { BAR_BORDER, BAR_FILL_INSET, BAR_STYLE, barFillRect, barInnerRect, barTickXs, type UiRect } from '../tokenUiLayout';

/** The look every resource shares, bar or wheel: a thin grey border, a dark track, a fill set in from the border, faint ticks. */
export const BAR_LOOK = {
  border: BAR_BORDER,
  borderColor: BAR_STYLE.border,
  trackColor: BAR_STYLE.inside,
  fillInset: BAR_FILL_INSET,
  tickColor: BAR_STYLE.tick,
  tickAlpha: BAR_STYLE.tickAlpha,
} as const;

/** `#rrggbb` as the number PIXI takes. */
export function colorNumber(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/** One resource as a pill bar: dark track with tick marks, a fill in the resource's colour and "x / y". */
export class ResourceBarView {
  readonly view = new Container();
  private readonly track = new Graphics();
  private readonly fill: AnimatedBarFill;
  private readonly label = new ResourceBarLabel();
  private color = 0xffffff;
  /** Top the track was last drawn at; the track is static, so it is only redrawn when it moves. */
  private drawnTop: number | null = null;

  constructor(ticker: Ticker | null) {
    this.fill = new AnimatedBarFill(() => this.color, ticker);
    this.label.alpha = 0;
    this.view.addChild(this.track, this.fill.view, this.label);
  }

  /** Shows `resource` with the bar's top edge at `top`; returns the height it takes. */
  update({ definition, value }: VisibleResource, top: number, animate: boolean): number {
    const { width, height } = barDimensions.token;
    this.color = colorNumber(resourceColor(definition, value));
    const inner = barInnerRect({ x: -width / 2, y: top, width, height });
    if (this.drawnTop !== top) {
      this.drawnTop = top;
      this.drawTrack(top, inner);
    }
    // A static value fills its bar: there is no share of it to show
    const fixed = definition.direction === 'static';
    this.fill.set(fixed ? 1 : value.max > 0 ? value.current / value.max : 0, barFillRect(inner), animate);
    if (fixed) this.label.setFixed(value.max);
    else this.label.setValue(value);
    this.label.position.set(0, top + height / 2);
    return height;
  }

  get textAlpha(): number {
    return this.label.alpha;
  }

  setTextAlpha(alpha: number): void {
    this.label.alpha = alpha;
  }

  setResolution(resolution: number): void {
    this.label.setResolution(resolution);
  }

  destroy(): void {
    this.fill.destroy();
    destroyTree(this.view);
  }

  private drawTrack(top: number, inner: UiRect): void {
    const { width, height } = barDimensions.token;
    this.track.clear()
      .roundRect(-width / 2, top, width, height, height / 2)
      .stroke({ width: BAR_BORDER, color: BAR_LOOK.borderColor, alpha: 1 })
      .roundRect(inner.x, inner.y, inner.width, inner.height, inner.height / 2)
      .fill({ color: BAR_LOOK.trackColor, alpha: 1 });
    for (const x of barTickXs(inner)) {
      this.track
        .moveTo(x, inner.y + 1)
        .lineTo(x, inner.y + inner.height - 1)
        .stroke({ width: BAR_STYLE.tickWidth, color: BAR_LOOK.tickColor, alpha: BAR_LOOK.tickAlpha });
    }
  }
}
