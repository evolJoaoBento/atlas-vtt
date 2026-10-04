import { describe, expect, it } from 'vitest';
import { SCENE_LAYER_ORDER, SCENE_LAYER_Z } from '../../src/app/pixi/sceneLayerOrder';
import { DEFAULT_TEXT_PADDING, textBackground, textFontStyle, textFontWeight, textRotation, textScale } from '../../src/app/pixi/textBoxLayout';

describe('scene layer order', () => {
  it('stacks map and grid at the bottom, then the zIndex layers in ascending order', () => {
    expect(SCENE_LAYER_ORDER).toEqual(['map', 'grid', 'tokens', 'texts', 'drawings', 'fog']);
    const zLayers = SCENE_LAYER_ORDER.filter((layer): layer is keyof typeof SCENE_LAYER_Z => layer in SCENE_LAYER_Z);
    expect(zLayers).toEqual(['tokens', 'texts', 'drawings', 'fog']);
    const z = zLayers.map((layer) => SCENE_LAYER_Z[layer]);
    expect(z).toEqual([...z].sort((a, b) => a - b));
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
