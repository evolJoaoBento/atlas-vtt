import { describe, expect, it } from 'vitest';
import { fullPayload, playerSafePayload, type PayloadContext, type SharedMapSource } from '../../../../src/app/online/sharing/model/buildMapPayload';
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
  return { map, state: { ...map, objects: { ...map.objects, audios: {} }, widgetSettings: undefined, widgetValues: {}, initiative: null, initiativeTrackerOpen: false } as never, extra: { dmNotePath: 'GM/Prep.md' } };
}

const context = (ticked: string[]): PayloadContext => ({
  rules: { showGrid: true, showTokenHP: false, showTokenStress: false, showTokenNameplates: true, showWidgets: true, showInitiative: true },
  collectionGrid: null,
  images: { fingerprints: new Map([['maps/inn.png', 'M'.repeat(43)], ['art/hero.png', 'H'.repeat(43)], ['art/spy.png', 'S'.repeat(43)]]), size: { width: 700, height: 700 } },
  noteItem: (path) => (ticked.includes(path) ? `item-${path.length}`.padEnd(22, 'x') : null),
  linked: ticked.map((path) => `item-${path.length}`.padEnd(22, 'x')),
  isFile: (path) => /\.(md|png)$/.test(path),
});

describe('map payloads', () => {
  it('player-safe: what players see, pins that are not GM-only, notes only when ticked', () => {
    const payload = playerSafePayload(source(), 'Inn', context(['Notes/Inn.md', 'Notes/Plot.md', 'Notes/Hero.md']));
    expect(Object.keys(payload.scene.tokens)).toEqual(['hero']);
    expect(payload.scene.map.asset).toBe('M'.repeat(43));
    expect(payload.pins.map((pin) => pin.x)).toEqual([10]);
    expect(Object.keys(payload.tokenNotes)).toEqual(['hero']);
    expect(payload.images.sort()).toEqual(['H'.repeat(43), 'M'.repeat(43)]);
    expect(JSON.stringify(payload)).not.toMatch(/Notes\/|art\/|maps\/|GM\//);
    expect(parseMapPayload(JSON.parse(JSON.stringify(payload)))).toEqual(payload);
  });

  it('player-safe: a pin whose note is not ticked is left out (N-4)', () => {
    expect(playerSafePayload(source(), 'Inn', context([])).pins).toEqual([]);
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

  it('refuses payloads of the wrong shape', () => {
    expect(parseMapPayload({ format: 'other' })).toBeNull();
    expect(parseMapPayload({ format: 'atlas-share-map-v1', mode: 'player-safe', name: 'x', scene: {}, pins: [], tokenNotes: {}, notes: [], images: [] })).toBeNull();
    expect(parseMapPayload({ format: 'atlas-share-map-v1', mode: 'full', name: 'x', map: [], notes: [], images: [] })).toBeNull();
  });
});
