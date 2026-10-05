import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hexLayoutOfGrid } from '../../../../src/app/grid/hexLinks';
import { fullPayload, pinFootprint, playerSafePayload, readSharedMap, type PayloadContext, type SharedMapSource } from '../../../../src/app/online/sharing/model/buildMapPayload';
import { IMAGE_REF_PREFIX, NOTE_REF_PREFIX, parseMapPayload } from '../../../../src/app/online/sharing/model/mapPayload';
import { migrateMapFile } from '../../../../src/app/services/MapPersistence';

const state = {
  background: 'maps/inn.png',
  grid: { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
  objects: {
    tokens: {
      hero: { id: 'hero', kind: 'character', x: 70, y: 70, imagePath: 'art/hero.png', name: 'Hero', notePath: 'Notes/Hero.md' },
      spy: { id: 'spy', kind: 'character', x: 140, y: 70, imagePath: 'art/spy.png', isHidden: true, notePath: 'Notes/Spy.md' },
    },
    pins: {
      inn: { id: 'inn', kind: 'pin', x: 10, y: 10, notePath: 'Notes/Inn.md' },
      plot: { id: 'plot', kind: 'pin', x: 20, y: 20, notePath: 'Notes/Plot.md', gmOnly: true },
    },
    walls: { w: { id: 'w' } },
  },
  dmNotePath: 'GM/Prep.md',
};

function source(): SharedMapSource {
  const map = migrateMapFile(state);
  return { map, state: { ...map, objects: { ...map.objects, audios: {} }, widgetSettings: undefined, widgetValues: {}, initiative: null, initiativeTrackerOpen: false } as never, extra: { dmNotePath: 'GM/Prep.md' }, lit: false };
}

const context = (ticked: string[]): PayloadContext => ({
  rules: { showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true },
  collectionGrid: null,
  coneAngle: 90,
  initiativeRules: { mode: 'turn-order', roll: '1d20', firstSide: 'players' },
  images: { fingerprints: new Map([['maps/inn.png', 'M'.repeat(43)], ['art/hero.png', 'H'.repeat(43)], ['art/spy.png', 'S'.repeat(43)]]), size: { width: 700, height: 700 } },
  noteItem: (path) => (ticked.includes(path) ? `item-${path.length}`.padEnd(22, 'x') : null),
  linked: ticked.map((path) => `item-${path.length}`.padEnd(22, 'x')),
  isFile: (path) => /\.(md|png)$/.test(path),
});

describe('map payloads', () => {
  it('player-safe: what players see, pins that are not GM-only, notes only when ticked', () => {
    const payload = playerSafePayload(source(), 'Inn', context(['Notes/Inn.md', 'Notes/Plot.md', 'Notes/Hero.md']))!;
    expect(Object.keys(payload.scene.tokens)).toEqual(['hero']);
    expect(payload.scene.map.asset).toBe('M'.repeat(43));
    expect(payload.pins.map((pin) => pin.x)).toEqual([10]);
    expect(Object.keys(payload.tokenNotes)).toEqual(['hero']);
    expect(payload.images.sort()).toEqual(['H'.repeat(43), 'M'.repeat(43)]);
    expect(JSON.stringify(payload)).not.toMatch(/Notes\/|art\/|maps\/|GM\//);
    expect(parseMapPayload(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
  });

  describe('the fog over the map edge (F-POS)', () => {
    const withPins = (fog: Record<string, unknown>): SharedMapSource => {
      const map = migrateMapFile({
        ...state,
        objects: {
          ...state.objects,
          tokens: { hero: { id: 'hero', kind: 'character', x: 664, y: 350, imagePath: 'art/hero.png', name: 'Hero' } },
          pins: {
            edge: { id: 'edge', kind: 'pin', x: 698, y: 698, notePath: 'Notes/Inn.md' },
            inside: { id: 'inside', kind: 'pin', x: 300, y: 300, notePath: 'Notes/Inn.md' },
            out: { id: 'out', kind: 'pin', x: 800, y: 300, notePath: 'Notes/Inn.md' },
          },
          fog,
        },
      });
      return { map, state: { ...map, objects: { ...map.objects, audios: {} }, widgetSettings: undefined, widgetValues: {}, initiative: null, initiativeTrackerOpen: false } as never, extra: {}, lit: false };
    };
    const everything = { f: { id: 'f', kind: 'fog', type: 'rectangle', timestamp: 1, isErasing: false, x: 0, y: 0, width: 700, height: 700 } };
    const pinXs = (payload: ReturnType<typeof playerSafePayload>): number[] => (payload?.pins ?? []).map((pin) => pin.x);

    it('sends no pin or token of a map fogged exactly to its size, and no pin outside the map', () => {
      const payload = playerSafePayload(withPins(everything), 'Inn', context(['Notes/Inn.md']))!;
      expect(pinXs(payload)).toEqual([]);
      expect(payload.scene.tokens).toEqual({});
    });

    const elsewhere = { f: { id: 'f', kind: 'fog', type: 'rectangle', timestamp: 1, isErasing: false, x: 0, y: 0, width: 10, height: 10 } };

    it('sends every pin when no fog is painted, as before, and with fog elsewhere the pins inside the map, the edge one too', () => {
      expect(pinXs(playerSafePayload(withPins({}), 'Inn', context(['Notes/Inn.md']))).sort((a, b) => a - b)).toEqual([300, 698, 800]);
      const payload = playerSafePayload(withPins(elsewhere), 'Inn', context(['Notes/Inn.md']))!;
      expect(pinXs(payload).sort((a, b) => a - b)).toEqual([300, 698]);
      expect(Object.keys(payload.scene.tokens)).toEqual(['hero']);
    });

    it('sends nothing of a map whose image size could not be read when fog is painted, and as before when it is not', () => {
      const unread = { ...context(['Notes/Inn.md']), images: { fingerprints: new Map([['maps/inn.png', 'M'.repeat(43)], ['art/hero.png', 'H'.repeat(43)]]), size: { width: 0, height: 0 } } };
      const payload = playerSafePayload(withPins(elsewhere), 'Inn', unread)!;
      expect(pinXs(payload)).toEqual([]);
      expect(payload.scene.tokens).toEqual({});
      expect(pinXs(playerSafePayload(withPins({}), 'Inn', unread))).toHaveLength(3);
    });

    it('checks a pin linked to a hex over the whole hex: a revealed point in a fogged hex hides it', () => {
      const hexMap = (reveal: { x: number; y: number; width: number; height: number }): SharedMapSource => {
        const map = migrateMapFile({
          ...state,
          grid: { enabled: true, visible: true, type: 'hex-horizontal', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
          objects: {
            ...state.objects, tokens: {},
            pins: { hex: { id: 'hex', kind: 'pin', x: 300, y: 300, notePath: 'Notes/Inn.md', hex: true } },
            fog: {
              ...everything,
              r: { id: 'r', kind: 'fog', type: 'rectangle', timestamp: 2, isErasing: true, ...reveal },
            },
          },
        });
        return { map, state: { ...map, objects: { ...map.objects, audios: {} }, widgetSettings: undefined, widgetValues: {}, initiative: null, initiativeTrackerOpen: false } as never, extra: {}, lit: false };
      };
      const layout = hexLayoutOfGrid({ type: 'hex-horizontal', size: 70, offsetX: 0, offsetY: 0 })!;
      const box = pinFootprint({ id: 'hex', kind: 'pin', x: 300, y: 300, notePath: 'Notes/Inn.md', hex: true } as never, layout);
      const around = (b: { x: number; y: number; width: number; height: number }, pad: number) => ({ x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad });
      // The pin's point and its badge are revealed, the rest of its hex is fogged: hidden.
      expect(pinXs(playerSafePayload(hexMap({ x: 270, y: 270, width: 60, height: 60 }), 'Inn', context(['Notes/Inn.md'])))).toEqual([]);
      // The whole hex revealed: shown.
      expect(pinXs(playerSafePayload(hexMap(around(box, 16)), 'Inn', context(['Notes/Inn.md'])))).toEqual([300]);
    });
  });

  it('player-safe: a pin whose note is not ticked is left out (N-4)', () => {
    expect(playerSafePayload(source(), 'Inn', context([]))?.pins).toEqual([]);
  });

  it('refuses a player-safe payload of a map saved with dynamic lighting on, whatever this device’s toggle', async () => {
    const lit = await readSharedMap(async () => JSON.stringify({ version: 1, state: { ...state, lighting: { enabled: true, ambient: 0 } } }), 'm.atlasmap');
    expect(lit?.lit).toBe(true);
    expect(playerSafePayload(lit!, 'Inn', context([]))).toBeNull();
    expect(fullPayload(lit!, 'Inn', context([])).mode).toBe('full');
    const unlit = await readSharedMap(async () => JSON.stringify({ version: 1, state: { ...state, lighting: { enabled: false, ambient: 0 } } }), 'm.atlasmap');
    expect(unlit?.lit).toBe(false);
    expect(playerSafePayload(unlit!, 'Inn', context([]))?.mode).toBe('player-safe');
  });

  it('full: everything, with images and ticked notes as references and every other path cleared', () => {
    const payload = fullPayload(source(), 'Inn', context(['Notes/Inn.md']));
    const text = JSON.stringify(payload);
    expect(text).toContain(`${IMAGE_REF_PREFIX}${'S'.repeat(43)}`);
    expect(text).toContain(NOTE_REF_PREFIX);
    expect(text).not.toMatch(/Notes\/|art\/|maps\/|GM\//);
    expect(payload.map).toMatchObject({ objects: { walls: { w: { id: 'w' } } } });
    expect(parseMapPayload(JSON.parse(text))).toEqual(payload);
  });

  it('full: clears paths by key, whether or not the file exists (I4)', () => {
    const stale = migrateMapFile({
      background: 'maps/gone.png',
      objects: {
        tokens: { t: { id: 't', kind: 'character', x: 0, y: 0, imagePath: 'art/missing.png', statblockPath: 'GM/Twist reveal.md', notePath: 'GM/Renamed away.md' } },
        pins: { p: { id: 'p', kind: 'pin', x: 1, y: 1, notePath: 'GM/Folder' } },
        audios: { a: { id: 'a', kind: 'audio', x: 0, y: 0, path: 'sounds/lost.ogg' } },
      },
    });
    const none = { ...source(), map: stale, extra: { dmNotePath: 'GM/Prep', mapPath: 'atlas-vtt/collections/c/Inn.atlasmap' } };
    const text = JSON.stringify(fullPayload(none, 'Inn', { ...context([]), images: { fingerprints: new Map(), size: { width: 0, height: 0 } }, isFile: () => false }));
    expect(text).not.toMatch(/GM\/|art\/|maps\/|sounds\/|atlas-vtt\//);
  });

  it('clears plural *Paths keys and values nested under a path key (R2-4)', () => {
    const map = migrateMapFile({ background: 'maps/inn.png', objects: { tokens: {}, pins: {} } });
    const extra = { notePaths: ['Secret/a.md', 'Secret/b.md'], imagePath: { src: 'Secret/c.png', deeper: [{ url: 'Secret/d.png' }] }, other: { paths: { x: 'Secret/e.md' } } };
    const text = JSON.stringify(fullPayload({ ...source(), map, extra }, 'Inn', { ...context([]), isFile: () => false }));
    expect(text).not.toContain('Secret/');
  });

  it('every *Path field of the map types is covered by that test (a new one must be added)', () => {
    const types = readFileSync(resolve(__dirname, '../../../../src/app/types.ts'), 'utf8');
    const fields = [...new Set([...types.matchAll(/\b(\w*Path)\??:/g)].map((match) => match[1]))].sort();
    expect(fields).toEqual(['imagePath', 'notePath', 'statblockPath']);
    const token = { id: 't', kind: 'character', x: 0, y: 0 };
    const filled = migrateMapFile({
      background: 'maps/inn.png',
      objects: { tokens: { t: { ...token, ...Object.fromEntries(fields.map((field) => [field, `Secret/${field}.md`])) } }, pins: { p: { id: 'p', kind: 'pin', x: 1, y: 1, notePath: 'Secret/pin.md' } } },
    });
    const text = JSON.stringify(fullPayload({ ...source(), map: filled }, 'Inn', { ...context([]), isFile: () => false }));
    expect(text).not.toContain('Secret/');
  });

  it('refuses payloads of the wrong shape', () => {
    expect(parseMapPayload({ format: 'other' })).toBeNull();
    expect(parseMapPayload({ format: 'atlas-share-map-v1', mode: 'player-safe', name: 'x', scene: {}, pins: [], tokenNotes: {}, notes: [], images: [] })).toBeNull();
    expect(parseMapPayload({ format: 'atlas-share-map-v1', mode: 'full', name: 'x', map: [], notes: [], images: [] })).toBeNull();
  });
});
