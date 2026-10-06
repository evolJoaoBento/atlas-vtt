/**
 * The art of a dice look another plugin added, made ready to paint: asked for once per
 * registration, each face copied into a canvas of Atlas's own no larger than a face cell. A face
 * whose art is missing, fails, arrives late, is too large or would taint the atlas (a cross-origin
 * image without CORS, which WebGL then refuses to upload for every die of its kind) is left out,
 * and Atlas paints its own numeral there: a look never breaks a die.
 */

import { getDomHost } from '../host/dom';
import { CELL } from './atlasCell';
import type { CustomDiceLook, FaceArtSet, FaceArtSource } from './customLooks';
import { artKeys, LOOK_BODIES, type DieBody } from './dieBody';
import { loadImage } from './dieNumerals';

/** How long one body's art may take, `faces()` and every image of it together. */
export const LOOK_ART_TIMEOUT_MS = 10_000;
/** The largest side of an image Atlas takes for a face; larger is left out rather than decoded into memory again. */
export const MAX_FACE_IMAGE_SIDE = 8192;

/** Ready art by body and key (`artKeys`). */
export type BodyArt = ReadonlyMap<DieBody, ReadonlyMap<number, HTMLCanvasElement>>;

export interface LookArt {
  faces: BodyArt;
  /** Relief by body and key; a face without it is pressed in from its `faces` art. */
  bump: BodyArt;
}

const loaded = new WeakMap<CustomDiceLook, Promise<LookArt>>();

class TimedOut extends Error {}

function within<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const left = deadline - Date.now();
  if (left <= 0) return Promise.reject(new TimedOut());
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new TimedOut()), left);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error: unknown) => { window.clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); },
    );
  });
}

/** The size an image source reports, or null when it reports none. */
function sizeOf(source: CanvasImageSource): { width: number; height: number } | null {
  const any = source as { naturalWidth?: number; naturalHeight?: number; displayWidth?: number; displayHeight?: number; width?: unknown; height?: unknown };
  const width = any.naturalWidth || any.displayWidth || (typeof any.width === 'number' ? any.width : 0);
  const height = any.naturalHeight || any.displayHeight || (typeof any.height === 'number' ? any.height : 0);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
}

/** `source` drawn into a canvas of Atlas's own, at most a cell on its longer side; null when it cannot be taken. */
export function copyFaceImage(source: CanvasImageSource): HTMLCanvasElement | null {
  const size = sizeOf(source);
  if (!size || size.width > MAX_FACE_IMAGE_SIDE || size.height > MAX_FACE_IMAGE_SIDE) return null;
  const scale = Math.min(1, CELL / Math.max(size.width, size.height));
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  const canvas = getDomHost().createCanvas(undefined, { width, height });
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, width, height);
    // Throws for a tainted canvas: such art would make WebGL refuse the whole atlas.
    ctx.getImageData(0, 0, 1, 1);
  } catch {
    return null;
  }
  return canvas;
}

async function faceImage(source: FaceArtSource, deadline: number): Promise<HTMLCanvasElement | null> {
  if (typeof source === 'string') {
    if (source === '') return null;
    const image = await within(loadImage(source, true), deadline);
    return copyFaceImage(image);
  }
  if (typeof source !== 'object' || source === null) return null;
  return copyFaceImage(source);
}

/** One body's art from `ask`, each face guarded; the keys it could not take are reported in `missed`. */
async function bodyArt(ask: (body: DieBody) => Promise<FaceArtSet>, body: DieBody, missed: string[]): Promise<Map<number, HTMLCanvasElement>> {
  const deadline = Date.now() + LOOK_ART_TIMEOUT_MS;
  const art = new Map<number, HTMLCanvasElement>();
  let set: unknown;
  try {
    set = await within(Promise.resolve(ask(body)), deadline);
  } catch (error) {
    missed.push(`d${body}: ${error instanceof TimedOut ? 'no answer within 10 s' : String(error instanceof Error ? error.message : error)}`);
    return art;
  }
  if (typeof set !== 'object' || set === null) {
    missed.push(`d${body}: not a record of images`);
    return art;
  }
  const record = set as Record<number, unknown>;
  const lost: number[] = [];
  await Promise.all(artKeys(body).map(async (key) => {
    if (!Object.hasOwn(record, key)) return;
    try {
      const canvas = await faceImage(record[key] as FaceArtSource, deadline);
      if (canvas) art.set(key, canvas);
      else lost.push(key);
    } catch {
      lost.push(key);
    }
  }));
  if (lost.length > 0) missed.push(`d${body}: ${lost.sort((a, b) => a - b).join(', ')}`);
  return art;
}

async function loadArt(look: CustomDiceLook): Promise<LookArt> {
  const missed: string[] = [];
  const faces = new Map<DieBody, Map<number, HTMLCanvasElement>>();
  const bump = new Map<DieBody, Map<number, HTMLCanvasElement>>();
  const relief = look.bump;
  await Promise.all(LOOK_BODIES.map(async (body) => {
    faces.set(body, await bodyArt((b) => look.faces(b), body, missed));
    if (relief) bump.set(body, await bodyArt(relief, body, missed));
  }));
  if (missed.length > 0) console.warn(`[Atlas] Dice look "${look.id}": Atlas paints its own numerals where art was missing or failed (${missed.join('; ')}).`);
  return { faces, bump };
}

/** The art of `look`, asked for and loaded once per registration; never rejects. */
export function lookArt(look: CustomDiceLook): Promise<LookArt> {
  let art = loaded.get(look);
  if (!art) {
    art = loadArt(look);
    loaded.set(look, art);
  }
  return art;
}
