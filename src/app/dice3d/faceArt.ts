/**
 * What a face cell carries: Atlas's numerals, or a dice look's art where it has some. Art goes
 * where the numeral would: centred on the numeral's place, upright as it reads, and as large as
 * the face lets it be within the numeral's margin (`fitNumeral`). On a d4 each of a face's three
 * corner numbers is its own mark, so its art is painted three times per face, turned to its corner.
 */

import { CELL } from './atlasCell';
import { artKey, bodySides, type DieBody } from './dieBody';
import { dieGeometry, faceIndexForValue } from './dieGeometry';
import { paintNumeralMark } from './dieNumerals';
import type { ResolvedLook } from './dieSkin';
import { faceMarks, type NumeralMark } from './faceMarks';
import { fitNumeral } from './numeralFit';

/** `art` in the room of `mark`, in the cell centred on `x`, `y`. */
function paintArt(ctx: CanvasRenderingContext2D, x: number, y: number, mark: NumeralMark, art: HTMLCanvasElement): void {
  const fill = CELL / Math.max(art.width, art.height);
  const k = fill * fitNumeral(mark.room, art.width * fill, art.height * fill);
  const width = art.width * k;
  const height = art.height * k;
  ctx.save();
  // The cell's y points up, the canvas' down.
  ctx.translate(x + mark.at[0], y - mark.at[1]);
  ctx.rotate(Math.atan2(mark.up[0], mark.up[1]));
  ctx.drawImage(art, -width / 2, -height / 2, width, height);
  ctx.restore();
}

/**
 * The marks of the face of `body` that stands for `value`: a look's art for its key where it has
 * some, Atlas's numeral (in `look`'s font and ink) everywhere else.
 */
export function paintFaceMarks(ctx: CanvasRenderingContext2D, x: number, y: number, body: DieBody, value: number, look: ResolvedLook): void {
  const sides = bodySides(body);
  const geometry = dieGeometry(sides);
  const art = look.art?.faces.get(body);
  for (const mark of faceMarks(geometry, faceIndexForValue(geometry, value), CELL)) {
    const image = art?.get(artKey(body, mark.value));
    if (image) paintArt(ctx, x, y, mark, image);
    else paintNumeralMark(ctx, x, y, sides, mark, look.font, look.ink);
  }
}

/**
 * The relief of the same marks, drawn dark into the tooth: a look's relief art as given (grey),
 * else its face art's silhouette, else Atlas's numeral, as Atlas presses its own numerals in.
 */
export function paintFaceRelief(ctx: CanvasRenderingContext2D, x: number, y: number, body: DieBody, value: number, look: ResolvedLook): void {
  const sides = bodySides(body);
  const geometry = dieGeometry(sides);
  const relief = look.art?.bump.get(body);
  const art = look.art?.faces.get(body);
  for (const mark of faceMarks(geometry, faceIndexForValue(geometry, value), CELL)) {
    const key = artKey(body, mark.value);
    const own = relief?.get(key);
    const image = own ?? art?.get(key);
    if (!image) {
      paintNumeralMark(ctx, x, y, sides, mark, look.font, null);
      continue;
    }
    ctx.save();
    ctx.filter = own ? 'grayscale(1)' : 'brightness(0)';
    paintArt(ctx, x, y, mark, image);
    ctx.restore();
  }
}
