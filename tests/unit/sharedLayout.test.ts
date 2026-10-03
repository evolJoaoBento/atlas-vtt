import { describe, expect, it } from 'vitest';
import { MIN_HEX_NUMBER_SCREEN_SIZE } from '../../src/app/grid/hexNumbering';
import { SCENE_LAYER_ORDER, SCENE_LAYER_Z } from '../../src/app/pixi/sceneLayerOrder';
import { DEFAULT_TEXT_PADDING, textBackground, textFontStyle, textFontWeight, textRotation, textScale } from '../../src/app/pixi/textBoxLayout';
import { badgePositions, badgeSlots, CONDITION_BADGE, fitBadges } from '../../src/app/pixi/token-renderer/conditionBadgeLayout';
import { getTokenRingCenterRadius } from '../../src/app/pixi/token-renderer/tokenRingMetrics';
import { computeTokenPixelSize, computeTokenStrokeWidth, restingTokenUIScale } from '../../src/app/pixi/token-renderer/tokenSizing';
import { barFillRect, barInnerRect, barStackRects, barTickXs, nameplateRect } from '../../src/app/pixi/token-renderer/tokenUiLayout';

describe('scene layer order', () => {
  it('stacks map and grid at the bottom, then the zIndex layers in ascending order', () => {
    expect(SCENE_LAYER_ORDER).toEqual(['map', 'grid', 'tokens', 'texts', 'drawings', 'fog']);
    const zLayers = SCENE_LAYER_ORDER.filter((layer): layer is keyof typeof SCENE_LAYER_Z => layer in SCENE_LAYER_Z);
    expect(zLayers).toEqual(['tokens', 'texts', 'drawings', 'fog']);
    const z = zLayers.map((layer) => SCENE_LAYER_Z[layer]);
    expect(z).toEqual([...z].sort((a, b) => a - b));
  });
});

describe('token UI layout', () => {
  it('stacks the bars below the token, the first two units under its edge and a gap between them', () => {
    expect(barStackRects(0)).toEqual([]);
    expect(barStackRects(1)).toEqual([{ x: -32, y: 2, width: 64, height: 10 }]);
    expect(barStackRects(2)[1]).toEqual({ x: -32, y: 14, width: 64, height: 10 });
  });

  it('insets the dark inside by half the border and the fill by one unit', () => {
    const inner = barInnerRect({ x: -32, y: 2, width: 64, height: 10 });
    expect(inner).toEqual({ x: -31.625, y: 2.375, width: 63.25, height: 9.25 });
    expect(barFillRect(inner)).toEqual({ x: -30.625, y: 3.375, width: 61.25, height: 7.25 });
    expect(barTickXs(inner)).toHaveLength(9);
    expect(barTickXs(inner)[0]).toBeCloseTo(-31.625 + 6.325);
  });

  it('sizes the nameplate to its text, at least 40 units wide, its bottom on the token edge', () => {
    expect(nameplateRect(48)).toEqual({ x: -20, y: -14, width: 40, height: 14, textY: -7 });
    expect(nameplateRect(300).width).toBeCloseTo(300 * 0.333 + 12);
  });
});

describe('condition badge layout', () => {
  const ringRadius = getTokenRingCenterRadius(computeTokenPixelSize(70, 1), computeTokenStrokeWidth(70), 1);
  const scale = restingTokenUIScale(70);

  it('fits three badges on a medium token, the last slot counting the rest', () => {
    expect(badgeSlots(ringRadius, scale)).toBe(3);
    expect(fitBadges(['a', 'b', 'c'], ringRadius, scale)).toEqual({ shown: ['a', 'b', 'c'], overflow: 0 });
    expect(fitBadges(['a', 'b', 'c', 'd', 'e'], ringRadius, scale)).toEqual({ shown: ['a', 'b'], overflow: 3 });
  });

  it('fans badges out around the upper left, the first nearest the top', () => {
    const [first, second] = badgePositions(2, ringRadius, scale);
    expect(Math.hypot(first!.x, first!.y)).toBeCloseTo(ringRadius);
    expect(first!.x).toBeLessThan(0);
    expect(first!.y).toBeLessThan(second!.y);
    expect(CONDITION_BADGE.radius).toBe(6);
  });
});

describe('text box layout', () => {
  it('grows a background by its padding, 8 when unset, at the text opacity', () => {
    const bounds = { x: -36, y: -14, width: 72, height: 28 };
    expect(textBackground({ backgroundColor: null }, bounds)).toBeNull();
    expect(textBackground({ backgroundColor: '#ffffff', padding: 0 }, bounds)).toEqual({
      x: -36 - DEFAULT_TEXT_PADDING, y: -22, width: 88, height: 44, color: '#ffffff', radius: 0, alpha: 1,
    });
    expect(textBackground({ backgroundColor: '#000000', padding: 4, borderRadius: 3, opacity: 0.5 }, bounds))
      .toMatchObject({ x: -40, width: 80, radius: 3, alpha: 0.5 });
  });

  it('reads weight, style, rotation and scale like the renderer', () => {
    expect([textFontWeight({ bold: true }), textFontWeight({})]).toEqual(['bold', 'normal']);
    expect([textFontStyle({ italic: true }), textFontStyle({ italic: null })]).toEqual(['italic', 'normal']);
    expect(textRotation(90)).toBeCloseTo(Math.PI / 2);
    expect([textRotation(undefined), textScale(0), textScale(2)]).toEqual([0, 1, 2]);
  });
});

describe('hex numbers', () => {
  it('hide below 7 CSS pixels on screen', () => {
    expect(MIN_HEX_NUMBER_SCREEN_SIZE).toBe(7);
  });
});
