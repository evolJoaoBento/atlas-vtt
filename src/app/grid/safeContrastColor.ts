/**
 * The automatic grid colour for any background sprite. `contrastColorForSprite` draws the
 * texture's resource onto a canvas, which only works for images, canvases and bitmaps: a
 * placeholder such as PIXI's `Texture.WHITE` has a byte array as its resource, and a closed
 * `ImageBitmap` throws too. Those read as not readable yet (null), so the grid takes its
 * default colour and samples again once the real image is there. Kept beside the upstream
 * helper so `GridSystem` changes by one call.
 */
import type { Sprite } from 'pixi.js';
import { contrastColorForSprite } from './gridContrastColor';

export function safeContrastColorForSprite(sprite: Sprite): number | null {
  const resource: unknown = sprite.destroyed ? null : sprite.texture?.source?.resource;
  if (ArrayBuffer.isView(resource) || resource instanceof ArrayBuffer) return null;
  try {
    return contrastColorForSprite(sprite);
  } catch {
    return null;
  }
}
