import { describe, expect, it } from 'vitest';
import { FogCoverage } from '../../../src/app/online/scene/FogCoverage';
import { clipToMap, drawingBounds, textBounds, tokenBounds } from '../../../src/app/online/scene/objectBounds';
import type { PlayerViewRules } from '../../../src/app/online/scene/playerViewRules';
import { projectForPlayers, type ProjectedState } from '../../../src/app/online/scene/projectForPlayers';
import { createProjectionMemo, projectFog } from '../../../src/app/online/scene/projectRecords';
import type { MapSize, ScenePoint } from '../../../src/app/online/scene/sceneTypes';
import type { Character, DrawingStroke, TextElement } from '../../../src/app/types';
import type { FogOperation } from '../../../src/app/types/fogTypes';
import { createDefaultInitiativeState } from '../../../src/app/types/initiativeTypes';
import { fakeAssetIds, insideByNonzero } from './sceneFixtures';

const RULES: PlayerViewRules = { showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true };
const assets = fakeAssetIds();

function state(objects: Partial<ProjectedState['objects']>): ProjectedState {
  return {
    background: 'maps/cave.png',
    grid: { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
    objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, audios: {}, ...objects },
    widgetSettings: { widgets: {}, globalVisible: true, position: 'top', scale: 1 },
    widgetValues: {},
    initiative: createDefaultInitiativeState(),
    initiativeTrackerOpen: false,
  } as ProjectedState;
}

function projectOn(map: MapSize, fog: FogOperation[], objects: Partial<ProjectedState['objects']>, gridSize = 70) {
  const memo = createProjectionMemo();
  const record = Object.fromEntries(fog.map((op) => [op.id, op]));
  const coverage = FogCoverage.fromPlayerFog(projectFog(record, memo));
  const st = { ...state({ ...objects, fog: record }), grid: { ...state({}).grid!, size: gridSize } } as ProjectedState;
  return projectForPlayers(st, { sceneId: 's', rules: RULES, coverage, assets, mapSize: map, memo });
}

const rect = (id: string, timestamp: number, isErasing: boolean, x: number, y: number, width: number, height: number): FogOperation => (
  { id, kind: 'fog', type: 'rectangle', timestamp, isErasing, x, y, width, height }
);
const hero = (id: string, x: number, y: number): Character => ({ id, kind: 'character', x, y, imagePath: `art/${id}.png`, name: id, size: 1 } as Character);
const note = (id: string, x: number, y: number): TextElement => (
  { id, kind: 'text', x, y, text: 'a', fontSize: 1, fontFamily: 'serif', color: '#000000', width: 4, height: 4 } as TextElement
);
const ink = (id: string, x: number, y: number): DrawingStroke => (
  { id, kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x, y }, { x: x + 0.5, y }], color: '#ff0000', width: 1, opacity: 1 }
);

describe('the fog leaves an item revealed only where it surely does (F-POS)', () => {
  const map = { width: 700, height: 500 };
  // A token is a cell (70 px) wide, so its centre sits half a cell inside the edge; the text and the drawing sit at x 698.
  const edgeItems = {
    tokens: { edge: hero('edge', 664, 250) },
    texts: { edge: note('edge', 698, 100) },
    drawings: { edge: ink('edge', 698, 300) },
  };
  const outside = {
    tokens: { out: hero('out', 900, 250) },
    texts: { out: note('out', 760, 100) },
    drawings: { out: ink('out', 760, 300) },
  };
  const both = {
    tokens: { ...edgeItems.tokens, ...outside.tokens },
    texts: { ...edgeItems.texts, ...outside.texts },
    drawings: { ...edgeItems.drawings, ...outside.drawings },
  };
  const keys = (scene: ReturnType<typeof projectOn>): string[] => [...Object.keys(scene.tokens), ...Object.keys(scene.texts), ...Object.keys(scene.drawings)];

  it('hides items at x 697 to 699 of a map fogged exactly to its size, and whatever lies outside it', () => {
    const fogged = [rect('f', 1, false, 0, 0, 700, 500)];
    expect(keys(projectOn(map, fogged, both))).toEqual([]);
  });

  it('sends them when nothing is fogged, but never what lies outside the map', () => {
    const scene = projectOn(map, [], both);
    expect(keys(scene)).toEqual(['edge', 'edge', 'edge']);
    expect(Object.keys(scene.tokens)).toEqual(['edge']);
  });

  it('sends the edge items when a reveal rectangle covers exactly the map, over a fog of the same size', () => {
    const revealed = [rect('f', 1, false, 0, 0, 700, 500), rect('r', 2, true, 0, 0, 700, 500)];
    expect(keys(projectOn(map, revealed, both))).toEqual(['edge', 'edge', 'edge']);
  });

  it('hides an item when the reveal stops short of the map edge it touches', () => {
    const partly = [rect('f', 1, false, 0, 0, 700, 500), rect('r', 2, true, 0, 0, 690, 500)];
    expect(Object.keys(projectOn(map, partly, edgeItems).texts)).toEqual([]);
  });

  it('sends a token with some cell of it revealed, as the player window draws it, and hides one in the edge strip or off the map only', () => {
    const fogged = rect('f', 1, false, 0, 0, 700, 500);
    const half = [fogged, rect('r', 2, true, 0, 0, 350, 500)];
    // Half in a revealed area: sent. Wholly under the fog: hidden.
    expect(Object.keys(projectOn(map, half, { tokens: { half: hero('half', 350, 250), under: hero('under', 600, 250) } }).tokens)).toEqual(['half']);
    // On a grid of 4 px a token is 4 px wide: this one is only in the x 696 to 699 strip, and this one only in the strip and past the edge.
    const strip = { tokens: { strip: hero('strip', 698, 250), straddle: hero('straddle', 700, 250) } };
    expect(Object.keys(projectOn(map, [fogged], strip, 4).tokens)).toEqual([]);
    expect(Object.keys(projectOn(map, [fogged, rect('r', 2, true, 0, 0, 696, 500)], strip, 4).tokens)).toEqual([]);
    // Nothing fogged: the strip is revealed like the rest of the map, the straddling token has its part inside it, and a token off the map has none.
    expect(Object.keys(projectOn(map, [], { tokens: { ...strip.tokens, off: hero('off', 760, 250) } }, 4).tokens)).toEqual(['strip', 'straddle']);
  });

  it('shows nothing on a map of unknown size, and everything again once it is known', () => {
    expect(keys(projectOn({ width: 0, height: 0 }, [], edgeItems))).toEqual([]);
    expect(keys(projectOn(map, [], edgeItems))).toHaveLength(3);
  });

  it('works the check out again for a new map size, never holding the closed one of an unknown size', () => {
    const fogged = FogCoverage.fromPlayerFog(projectFog({ f: rect('f', 1, false, 0, 0, 100, 100) }, createProjectionMemo()));
    const bounds = { x: 500, y: 100, width: 10, height: 10 };
    expect(fogged.reveal({ width: 0, height: 0 }).revealed(bounds)).toBe(false);
    expect(fogged.reveal(map).revealed(bounds)).toBe(true);
    expect(fogged.reveal({ width: 0, height: 0 }).revealed(bounds)).toBe(false);
  });

  it('clips an item to the map and hides one that is wholly outside or only touches the edge from outside', () => {
    expect(clipToMap({ x: -20, y: 10, width: 40, height: 10 }, map)).toEqual({ x: 0, y: 10, width: 20, height: 10 });
    expect(clipToMap({ x: -50, y: 10, width: 50, height: 10 }, map)).toBeNull();
    expect(clipToMap({ x: 700, y: 10, width: 50, height: 10 }, map)).toBeNull();
    expect(clipToMap({ x: 700, y: 10, width: 0, height: 0 }, map)).not.toBeNull();
    expect(clipToMap({ x: 10, y: 10, width: 5, height: 5 }, { width: 0, height: 0 })).toBeNull();
    expect(clipToMap({ x: Number.NaN, y: 10, width: 5, height: 5 }, map)).toBeNull();
  });

  it('answers as the pixel truth does over random maps, shapes and orders: what is sent is revealed', () => {
    let seed = 4242;
    const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    const between = (low: number, high: number): number => low + random() * (high - low);
    let sent = 0;
    let withheld = 0;
    for (let round = 0; round < 60; round++) {
      const size = { width: Math.floor(between(50, 260)) | 1, height: Math.floor(between(50, 200)) | 1 };
      const ops: FogOperation[] = [];
      for (let i = 0; i < 1 + Math.floor(random() * 6); i++) {
        const isErasing = random() < 0.5;
        const kind = random();
        const px = (): number => between(-10, size.width + 10);
        const py = (): number => between(-10, size.height + 10);
        if (kind < 0.4) ops.push(rect(`o${i}`, i + 1, isErasing, px(), py(), between(10, size.width), between(10, size.height)));
        else if (kind < 0.7) ops.push({ id: `o${i}`, kind: 'fog', type: 'brush', timestamp: i + 1, isErasing, brushRadius: between(4, 40), points: [{ x: px(), y: py() }, { x: px(), y: py() }, { x: px(), y: py() }] });
        else ops.push({ id: `o${i}`, kind: 'fog', type: 'lasso', timestamp: i + 1, isErasing, points: Array.from({ length: 5 }, () => ({ x: px(), y: py() })) });
      }
      const revealed = referenceRevealed(ops, size);
      const tokens: Record<string, Character> = {};
      const texts: Record<string, TextElement> = {};
      const drawings: Record<string, DrawingStroke> = {};
      for (let i = 0; i < 20; i++) {
        tokens[`k${i}`] = hero(`k${i}`, between(-20, size.width + 20), between(-20, size.height + 20));
        texts[`t${i}`] = note(`t${i}`, between(-10, size.width + 10), between(-10, size.height + 10));
        const x = between(-10, size.width + 10);
        const y = between(-10, size.height + 10);
        drawings[`d${i}`] = { ...ink(`d${i}`, x, y), points: [{ x, y }, { x: x + between(-15, 15), y: y + between(-15, 15) }], width: between(0.5, 3) };
      }
      const scene = projectOn(size, ops, { tokens, texts, drawings });
      const allRevealed = (bounds: { x: number; y: number; width: number; height: number }): boolean => {
        const x0 = Math.floor(Math.max(bounds.x, 0));
        const x1 = Math.ceil(Math.min(bounds.x + bounds.width, size.width));
        const y0 = Math.floor(Math.max(bounds.y, 0));
        const y1 = Math.ceil(Math.min(bounds.y + bounds.height, size.height));
        if (x1 <= x0 || y1 <= y0) return false;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!revealed[y * size.width + x]) return false;
        return true;
      };
      const anyRevealed = (bounds: { x: number; y: number; width: number; height: number }): boolean => {
        const x0 = Math.floor(Math.max(bounds.x, 0));
        const x1 = Math.ceil(Math.min(bounds.x + bounds.width, size.width));
        const y0 = Math.floor(Math.max(bounds.y, 0));
        const y1 = Math.ceil(Math.min(bounds.y + bounds.height, size.height));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (revealed[y * size.width + x]) return true;
        return false;
      };
      for (const id of Object.keys(tokens)) {
        const token = tokens[id]!;
        if (id in scene.tokens) {
          sent++;
          // A token needs some pixel of it revealed (the window draws it half under the fog), none at all would be a leak.
          expect(anyRevealed(tokenBounds({ x: token.x, y: token.y, size: 1 }, 70)), `token ${id}, round ${round}`).toBe(true);
        } else withheld++;
      }
      for (const id of Object.keys(texts)) {
        const out = scene.texts[id];
        if (out) {
          sent++;
          expect(allRevealed(textBounds(out)), `text ${id}, round ${round}`).toBe(true);
        } else withheld++;
      }
      for (const id of Object.keys(drawings)) {
        const out = scene.drawings[id];
        if (out) {
          sent++;
          expect(allRevealed(drawingBounds(out)), `drawing ${id}, round ${round}`).toBe(true);
        } else withheld++;
      }
    }
    // Neither an always-send nor an always-hide check passes this.
    expect(sent).toBeGreaterThan(50);
    expect(withheld).toBeGreaterThan(50);
  });
});

/** The pixel truth, as weak as the replay may be: fogging takes every pixel it touches, a reveal only the pixels it wholly covers. */
function referenceRevealed(ops: readonly FogOperation[], size: MapSize): Uint8Array {
  const revealed = new Uint8Array(size.width * size.height).fill(1);
  const HALF_DIAGONAL = Math.SQRT1_2 + 1e-6;
  const distanceToSegment = (p: ScenePoint, a: ScenePoint, b: ScenePoint): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  for (const op of [...ops].sort((a, b) => a.timestamp - b.timestamp)) {
    for (let y = 0; y < size.height; y++) {
      for (let x = 0; x < size.width; x++) {
        const corners = [{ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }];
        const centre = { x: x + 0.5, y: y + 0.5 };
        let touched: boolean;
        let whole: boolean;
        if (op.type === 'rectangle') {
          const left = Math.min(op.x, op.x + op.width);
          const right = Math.max(op.x, op.x + op.width);
          const top = Math.min(op.y, op.y + op.height);
          const bottom = Math.max(op.y, op.y + op.height);
          touched = x + 1 > left && x < right && y + 1 > top && y < bottom;
          whole = x >= left && x + 1 <= right && y >= top && y + 1 <= bottom;
        } else if (op.type === 'brush') {
          const segments = op.points.slice(1).map((p, i) => [op.points[i]!, p] as const);
          touched = segments.some(([a, b]) => distanceToSegment(centre, a, b) <= op.brushRadius + HALF_DIAGONAL);
          whole = segments.some(([a, b]) => corners.every((c) => distanceToSegment(c, a, b) <= op.brushRadius));
        } else {
          const edgeDistance = Math.min(...op.points.map((p, i) => distanceToSegment(centre, p, op.points[(i + 1) % op.points.length]!)));
          const inside = insideByNonzero(op.points, centre);
          touched = inside || edgeDistance <= HALF_DIAGONAL;
          whole = inside && edgeDistance > HALF_DIAGONAL;
        }
        if (op.isErasing ? whole : touched) revealed[y * size.width + x] = op.isErasing ? 1 : 0;
      }
    }
  }
  return revealed;
}
