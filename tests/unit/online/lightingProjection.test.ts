import { describe, expect, it } from 'vitest';
import { plainBuilders, playerSceneToAtlasState } from '../../../src/app/online/obsidian/playerSceneToAtlasState';
import { DARKNESS_FOG_ID, DARKNESS_ORDER } from '../../../src/app/online/scene/darknessFog';
import { closedFrame, lightingFrame } from '../../../src/app/online/scene/LiveLighting';
import { diffScenes } from '../../../src/app/online/scene/sceneDiff';
import { patchMessage, snapshotMessages } from '../../../src/app/online/scene/sceneMessages';
import type { PlayerScene, ScenePoint } from '../../../src/app/online/scene/sceneTypes';
import { FogLayer } from '../../../src/app/online/view/layers/fogLayer';
import { renderOperation } from '../../../src/app/pixi/fog/fogRenderUtils';
import type { DrawingStroke, TextElement } from '../../../src/app/types';
import type { FogOperation } from '../../../src/app/types/fogTypes';
import { character, light, lightingFrameOf, MAP, playerLightingOf, project, projectLit, scene, wall, type Scene } from './lightingFixtures';
import { frame, RecordingSurface } from './recordingSurface';
import { insideByNonzero } from './sceneFixtures';

function text(id: string, x: number, y: number): TextElement {
  return { id, kind: 'text', x, y, text: id, fontSize: 16, fontFamily: 'serif', color: '#000000' } as TextElement;
}

function drawing(id: string, x: number, y: number): DrawingStroke {
  return { id, kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x, y }, { x: x + 10, y }], color: '#ff0000', width: 2, opacity: 1 };
}

function darknessRing(projected: PlayerScene): ScenePoint[] {
  const op = projected.fog[DARKNESS_FOG_ID];
  if (op?.type !== 'lasso') throw new Error('no darkness');
  return op.points;
}

const isDark = (projected: PlayerScene, point: ScenePoint): boolean => insideByNonzero(darknessRing(projected), point);

/** Daylight, and a wall from top to bottom at x = 500: the hero sees the left half only. */
const walled = (extra: Partial<Scene['objects']> = {}): Scene => scene({ ambient: 1 }, {
  tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }), goblin: character('goblin', 800, 400) },
  walls: { w: wall('w', { x: 500, y: -10 }, { x: 500, y: 810 }) },
  ...extra,
});

/** Night, a torch at (400, 400) dim to 10 ft (140 px): the hero sees only what it lights, and itself. */
const torchlit = (goblinX = 420, torchX = 400): Scene => scene({ ambient: 0 }, {
  tokens: { hero: character('hero', 140, 400, { vision: { enabled: true } }), goblin: character('goblin', goblinX, 400) },
  lights: { torch: light('torch', torchX, 400) },
});

describe('dynamic lighting for online players', () => {
  it('leaves out a token outside every vision, with its nameplate, and darkens what no vision reaches', () => {
    const projected = projectLit(walled());
    expect(Object.keys(projected.tokens)).toEqual(['hero']);
    expect(projected.tokens.hero?.name).toBe('hero');
    expect(isDark(projected, { x: 300, y: 400 })).toBe(false);
    expect(isDark(projected, { x: 800, y: 400 })).toBe(true);
  });

  it('leaves out texts and drawings the darkness covers whole, as it does under fog', () => {
    const projected = projectLit(walled({
      texts: { seen: text('seen', 200, 200), dark: text('dark', 800, 200) },
      drawings: { seen: drawing('seen', 200, 600), dark: drawing('dark', 800, 600) },
    }));
    expect(Object.keys(projected.texts)).toEqual(['seen']);
    expect(Object.keys(projected.drawings)).toEqual(['seen']);
  });

  it('sends a text or drawing at the edge of a lit map, though its size pokes past it', () => {
    const state = scene({ ambient: 1 }, {
      texts: { edge: text('edge', 990, 200) },
      drawings: { edge: { ...drawing('edge', 995, 600), points: [{ x: 995, y: 600 }, { x: 1010, y: 600 }] } },
    });
    const projected = projectLit(state);
    expect(Object.keys(projected.texts)).toEqual(['edge']);
    expect(Object.keys(projected.drawings)).toEqual(['edge']);
  });

  it('leaves out a dark text or drawing crossing the map edge, and every one under a closed frame', () => {
    const objects = {
      texts: { lit: text('lit', 200, 200), edge: text('edge', 990, 200) },
      drawings: { lit: drawing('lit', 200, 600), edge: { ...drawing('edge', 995, 600), points: [{ x: 995, y: 600 }, { x: 1010, y: 600 }] } },
    };
    const projected = projectLit(walled(objects));
    expect(Object.keys(projected.texts)).toEqual(['lit']);
    expect(Object.keys(projected.drawings)).toEqual(['lit']);
    const closed = project(walled(objects), closedFrame(MAP));
    expect(closed.texts).toEqual({});
    expect(closed.drawings).toEqual({});
    // Without lighting nothing is darkened, so the edge is no reason to hide them.
    expect(Object.keys(project(walled(objects), null).texts).sort()).toEqual(['edge', 'lit']);
  });

  it('leaves out a text or drawing wholly outside the map', () => {
    const state = scene({ ambient: 1 }, {
      texts: { in: text('in', 200, 200), out: text('out', 1200, 200) },
      drawings: { in: drawing('in', 200, 600), out: drawing('out', 1200, 600) },
    });
    const projected = projectLit(state);
    expect(Object.keys(projected.texts)).toEqual(['in']);
    expect(Object.keys(projected.drawings)).toEqual(['in']);
  });

  it('leaves out an item that only touches the map edge from outside, and sends one touching it from inside', () => {
    const box = (id: string, x: number): TextElement => ({ ...text(id, x, 200), width: 100, height: 20 } as TextElement);
    const line = (id: string, from: number, to: number): DrawingStroke => ({ ...drawing(id, from, 600), points: [{ x: from, y: 600 }, { x: to, y: 600 }] });
    // Drawings grow by their width (2) on each side: points -60..-2 end at x = 0, 1002..1060 start at 1000.
    const state = scene({ ambient: 1 }, {
      texts: { left: box('left', -50), right: box('right', 1050), inside: box('inside', 950) },
      drawings: { left: line('left', -60, -2), right: line('right', 1002, 1060), inside: line('inside', 900, 998) },
    });
    const projected = projectLit(state);
    expect(Object.keys(projected.texts)).toEqual(['inside']);
    expect(Object.keys(projected.drawings)).toEqual(['inside']);
  });

  it('covers what no light reaches at night, shows what the torch lights and the hero standing in the dark', () => {
    const projected = projectLit(torchlit());
    expect(isDark(projected, { x: 400, y: 400 })).toBe(false);
    expect(isDark(projected, { x: 900, y: 100 })).toBe(true);
    expect(isDark(projected, { x: 700, y: 400 })).toBe(true);
    // The hero is the party: shown within its footprint, though it stands where no light is.
    expect(isDark(projected, { x: 140, y: 400 })).toBe(false);
    expect(Object.keys(projected.tokens).sort()).toEqual(['goblin', 'hero']);
  });

  it('follows a light that moves and a token that leaves the light', () => {
    const before = projectLit(torchlit());
    const moved = projectLit(torchlit(420, 700));
    expect(isDark(moved, { x: 400, y: 400 })).toBe(true);
    expect(isDark(moved, { x: 700, y: 400 })).toBe(false);
    expect(Object.keys(moved.tokens)).toEqual(['hero']);
    expect(diffScenes(before, moved)?.upsert.fog?.[DARKNESS_FOG_ID]).toBeDefined();
    // The goblin walks into the moved light.
    expect(Object.keys(projectLit(torchlit(690, 700)).tokens).sort()).toEqual(['goblin', 'hero']);
  });

  it('projects exactly as before without lighting: feature off, or the scene unlit', () => {
    const state = walled();
    const unlit = { ...state, lighting: { ...state.lighting, enabled: false } };
    expect(playerLightingOf(unlit, MAP)).toBeUndefined();
    expect(projectLit(unlit)).toEqual(project(unlit, null));
    expect(project(state, null).tokens.goblin).toBeDefined();
    expect(project(state, null).fog).toEqual({});
  });

  it('keeps the GM fog under the darkness, which goes last', () => {
    const fog: Record<string, FogOperation> = { f: { id: 'f', kind: 'fog', type: 'rectangle', timestamp: 5, isErasing: false, x: 0, y: 0, width: 50, height: 50 } };
    const projected = projectLit(walled({ fog }));
    expect(Object.keys(projected.fog)).toEqual(['f', DARKNESS_FOG_ID]);
    expect(projected.fog[DARKNESS_FOG_ID]?.order).toBe(DARKNESS_ORDER);
  });

  it('shows nothing until the view has worked out the scene\'s sight', () => {
    const entry = { id: 'e1', tokenId: 'hero', name: 'hero', initiative: 12, initiativeModifier: 0, imagePath: '', isActive: true, isNPC: false, order: 0 };
    const state: Scene = { ...walled(), initiativeTrackerOpen: true, initiative: { ...walled().initiative, isActive: true, entries: [entry] } };
    expect(projectLit(state).initiative?.entries.map(({ tokenId }) => tokenId)).toEqual(['hero']);
    const lighting = playerLightingOf(state, MAP)!;
    const notReady = { ...lighting, ready: false };
    const projected = project(state, lightingFrame(notReady, lightingFrameOf(state, MAP)!.darkness));
    expect(projected.tokens).toEqual({});
    expect(projected.initiative?.entries).toEqual([]);
  });

  it('leaves out a token the players only sense, which the window outlines', () => {
    const lighting = playerLightingOf(walled(), MAP)!;
    const sensing = { ...lighting, perception: (id: string) => (id === 'hero' ? 'seen' as const : 'sensed' as const) };
    const projected = project(walled(), lightingFrame(sensing, lightingFrameOf(walled(), MAP)!.darkness));
    expect(Object.keys(projected.tokens)).toEqual(['hero']);
  });

  it('never sends walls, lights or how tokens see, in any message', () => {
    const state = walled({ lightZones: { z: { id: 'z', kind: 'light-zone', polygon: [{ x: 0, y: 0 }, { x: 99, y: 0 }, { x: 0, y: 99 }], ambient: 0.5 } } });
    state.objects.lights = { torch: light('torch', 300, 300) };
    const before = projectLit(state);
    const after = projectLit({ ...state, objects: { ...state.objects, lights: { torch: light('torch', 320, 300) } } });
    const messages = [...(snapshotMessages(before) ?? []), patchMessage(diffScenes(before, after) ?? { set: {}, upsert: {}, remove: {} })];
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (typeof value === 'object' && value !== null) {
        for (const [key, inner] of Object.entries(value)) {
          keys.add(key);
          walk(inner);
        }
      }
    };
    walk(messages);
    for (const key of ['walls', 'lights', 'lightZones', 'vision', 'light', 'emission', 'p1', 'p2', 'senses', 'lighting', 'ambient', 'exploredMask', 'heldTokens', 'polygon']) {
      expect(keys.has(key), key).toBe(false);
    }
    expect(JSON.stringify(messages)).not.toContain('#ffcc88');
  });
});

describe('the darkness on both players\' clients', () => {
  it('is painted on the web page as one closed path over the map', () => {
    const projected = projectLit(walled());
    const surface = new RecordingSurface();
    new FogLayer().draw(surface, frame(projected));
    const paths = surface.layers[0]?.ops('paths') ?? [];
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({ closed: true, style: { erase: false } });
    const [ring] = paths[0]!.paths;
    expect(insideByNonzero(ring!, { x: 800, y: 400 })).toBe(true);
    expect(insideByNonzero(ring!, { x: 300, y: 400 })).toBe(false);
  });

  it('is an Atlas fog lasso in the Obsidian online scene, filled where it is dark', () => {
    const projected = projectLit(torchlit());
    const { fog } = playerSceneToAtlasState(projected, { background: () => null, token: () => null }, plainBuilders({ background: () => null, token: () => null })).state.objects;
    const op = fog[DARKNESS_FOG_ID];
    expect(op).toMatchObject({ type: 'lasso', isErasing: false, timestamp: DARKNESS_ORDER });
    // Atlas's fog renderer traces it on a canvas and fills it (nonzero).
    const ring: ScenePoint[] = [];
    let fills = 0;
    const context = {
      save: () => {}, restore: () => {}, beginPath: () => {}, closePath: () => {},
      moveTo: (x: number, y: number) => ring.push({ x, y }), lineTo: (x: number, y: number) => ring.push({ x, y }),
      fill: (...args: unknown[]) => { expect(args).toEqual([]); fills++; },
    } as unknown as CanvasRenderingContext2D;
    renderOperation(context, op!, { x: 0, y: 0, width: MAP.width, height: MAP.height }, 1, 0, 0);
    expect(fills).toBe(1);
    expect(insideByNonzero(ring, { x: 900, y: 100 })).toBe(true);
    expect(insideByNonzero(ring, { x: 400, y: 400 })).toBe(false);
  });
});
