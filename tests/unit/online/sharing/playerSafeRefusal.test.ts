import { describe, expect, it } from 'vitest';
import {
  FOG_TRUNCATED_NOT_PLAYER_SAFE, fullPayload, playerSafePayload, playerSafeRefusal, type PayloadContext, type SharedMapSource,
} from '../../../../src/app/online/sharing/model/buildMapPayload';
import { createProjectionMemo, fogTruncated } from '../../../../src/app/online/scene/projectRecords';
import { FogCoverageCache } from '../../../../src/app/online/scene/sceneSources';
import { SCENE_LIMITS } from '../../../../src/app/online/scene/sceneTypes';
import { clippedPinText, PIN_TEXT_LIMIT } from '../../../../src/app/online/sharing/model/mapPayload';
import { offeredNotes } from '../../../../src/app/online/sharing/model/linkedNotes';
import { migrateMapFile } from '../../../../src/app/services/MapPersistence';

const base = {
  background: 'maps/inn.png',
  grid: { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
  dmNotePath: 'GM/Prep.md',
};
const tiny = (id: string): Record<string, unknown> => ({ id, kind: 'fog', type: 'rectangle', timestamp: 1, isErasing: false, x: 0, y: 0, width: 1, height: 1 });
const cover = { id: 'last', kind: 'fog', type: 'rectangle', timestamp: 2, isErasing: false, x: 300, y: 300, width: 200, height: 200 };

/** `count` fog records, the last one covering the token at (400, 400). */
function fogOf(count: number, last: Record<string, unknown> = cover): Record<string, unknown> {
  const fog: Record<string, unknown> = {};
  for (let i = 0; i < count - 1; i++) fog[`f${i}`] = tiny(`f${i}`);
  fog.last = last;
  return fog;
}

function sourceWith(fog: Record<string, unknown>): SharedMapSource {
  const map = migrateMapFile({
    ...base,
    objects: { tokens: { hero: { id: 'hero', kind: 'character', x: 400, y: 400, imagePath: 'art/hero.png', name: 'Hero' } }, pins: {}, fog },
  });
  return { map, state: { ...map, objects: { ...map.objects, audios: {} }, widgetSettings: undefined, widgetValues: {}, initiative: null, initiativeTrackerOpen: false } as never, extra: {}, lit: false };
}

const context: PayloadContext = {
  rules: { showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true },
  collectionGrid: null,
  coneAngle: 90,
  initiativeRules: { mode: 'turn-order', roll: '1d20', firstSide: 'players' },
  images: { fingerprints: new Map([['maps/inn.png', 'M'.repeat(43)], ['art/hero.png', 'H'.repeat(43)]]), size: { width: 700, height: 700 } },
  noteItem: () => null,
  linked: [],
  isFile: () => true,
};

describe('a player-safe share refuses fog it cannot send whole', () => {
  it('refuses more fog records than SCENE_LIMITS.records, so a token under the last one does not leak', () => {
    const source = sourceWith(fogOf(SCENE_LIMITS.records + 1));
    expect(Object.keys(source.map.objects.fog)).toHaveLength(SCENE_LIMITS.records + 1);
    expect(playerSafeRefusal(source)).toBe(FOG_TRUNCATED_NOT_PLAYER_SAFE);
    expect(playerSafePayload(source, 'Inn', context)).toBeNull();
    // Full shares are unaffected: the receiver is a co-GM.
    expect(fullPayload).toBeTypeOf('function');
  });

  it('shares a map with exactly SCENE_LIMITS.records fog records, the token under the last one hidden', () => {
    const source = sourceWith(fogOf(SCENE_LIMITS.records));
    expect(playerSafeRefusal(source)).toBeNull();
    expect(playerSafePayload(source, 'Inn', context)?.scene.tokens).toEqual({});
  });

  it('refuses fog that covers but is not sent as it is: an unknown type, a brush wider than the wire allows', () => {
    expect(playerSafeRefusal(sourceWith({ a: { id: 'a', kind: 'fog', type: 'future-shape', timestamp: 1, isErasing: false } }))).toBe(FOG_TRUNCATED_NOT_PLAYER_SAFE);
    const wide = { id: 'b', kind: 'fog', type: 'brush', timestamp: 1, isErasing: false, brushRadius: 50000, points: [{ x: 1, y: 1 }] };
    expect(playerSafePayload(sourceWith({ b: wide }), 'Inn', context)).toBeNull();
    // An erasing record that projects to nothing hides nothing.
    expect(playerSafeRefusal(sourceWith({ e: { id: 'e', kind: 'fog', type: 'future-shape', timestamp: 1, isErasing: true } }))).toBeNull();
  });

  it("does not count a lasso that covers nothing, as Atlas's own stroke draws none (a stray click must not blank play)", () => {
    const lasso = (points: unknown[]): Record<string, never> => ({ l: { id: 'l', kind: 'fog', type: 'lasso', timestamp: 1, isErasing: false, points } } as never);
    expect(fogTruncated(lasso([{ x: 1, y: 1 }, { x: 5, y: 5 }]), createProjectionMemo())).toBe(false);
    expect(fogTruncated(lasso([{ x: 0, y: 0 }, { x: 1, y: 0.5 }, { x: 2, y: 0 }]), createProjectionMemo())).toBe(false);
    expect(fogTruncated(lasso([{ x: 0, y: 0 }, { x: 50, y: 0.2 }, { x: 100, y: 0 }]), createProjectionMemo())).toBe(false);
    expect(new FogCoverageCache().get(lasso([{ x: 0, y: 0 }, { x: 50, y: 0.2 }, { x: 100, y: 0 }]), createProjectionMemo()).truncated).toBe(false);
    // A point that does not read still fails closed.
    expect(fogTruncated(lasso([{ x: 0, y: 0 }, { x: 'a', y: 1 }, { x: 100, y: 100 }]), createProjectionMemo())).toBe(true);
  });

  it('clips a long pin icon and label to what a receiver takes, never through a character', () => {
    expect(clippedPinText('a'.repeat(100))).toBe('a'.repeat(PIN_TEXT_LIMIT));
    expect(clippedPinText(`${'a'.repeat(63)}\u{1F600}`)).toBe('a'.repeat(63));
    expect(clippedPinText('short')).toBe('short');
  });

  it('offers the note of a pin or token whose hidden flag is any truthy value only in a full share', () => {
    const map = migrateMapFile({
      ...base,
      objects: {
        tokens: { t: { id: 't', kind: 'character', x: 1, y: 1, isHidden: 1, notePath: 'Notes/T.md' } },
        pins: { p: { id: 'p', kind: 'pin', x: 1, y: 1, gmOnly: 'yes', notePath: 'Notes/P.md' } },
        fog: {},
      },
    });
    expect(offeredNotes(map, 'player-safe')).toEqual([]);
    expect(offeredNotes(map, 'full').map((note) => note.path).sort()).toEqual(['Notes/P.md', 'Notes/T.md']);
  });

  it('lets live play treat the same fog as truncated', () => {
    const memo = createProjectionMemo();
    const cache = new FogCoverageCache();
    const over = sourceWith(fogOf(SCENE_LIMITS.records + 1)).map.objects.fog;
    expect(cache.get(over, memo).truncated).toBe(true);
    const fine = sourceWith(fogOf(3)).map.objects.fog;
    expect(cache.get(fine, memo).truncated).toBe(false);
    const unknown = sourceWith({ a: { id: 'a', kind: 'fog', type: 'future-shape', timestamp: 1, isErasing: false } }).map.objects.fog;
    expect(cache.get(unknown, memo).truncated).toBe(true);
  });
});
