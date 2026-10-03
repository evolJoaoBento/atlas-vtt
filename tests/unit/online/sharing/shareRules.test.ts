/**
 * A player-safe share is projected with the same rules as live play: the cone angle the measure tool
 * opens on the map (`mapConeAngle`), and the initiative grouping of the map's collection. The sources
 * are the real ones (`obsidianCatalogueSources`), over a fake asset index.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { builtInPresetId } from '../../../../src/app/gameSystems/presets/presetHelpers';
import { obsidianCatalogueSources } from '../../../../src/app/online/sharing/model/catalogueSources';
import { SenderCatalogue, type CatalogueSources } from '../../../../src/app/online/sharing/model/SenderCatalogue';
import { parseMapPayload } from '../../../../src/app/online/sharing/model/mapPayload';
import { AssetService } from '../../../../src/app/services/AssetService';
import { migrateMapFile } from '../../../../src/app/services/MapPersistence';
import type { SettingsService } from '../../../../src/app/services/SettingsService';
import type { CollectionSettings } from '../../../../src/app/types/collectionSettingsTypes';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { memoryImageFiles, nodeHash } from '../assetFixtures';

afterEach(() => { vi.restoreAllMocks(); });

const T = 'T'.repeat(43);
const ben = { tableId: T, personId: 'ben' };
const person = { tableId: T, personId: 'ben', name: 'Ben', formerNames: [], devices: [], aliases: [], lastSeen: 0 };
const people = { byName: () => person, byKey: () => person, ready: async (): Promise<void> => {} };
const items = {
  idFor: (path: string): string => path.padEnd(22, '0').slice(0, 22),
  pathOf: (): string | null => null,
  ready: async (): Promise<void> => {},
};

function collection(settings: Partial<CollectionSettings>): void {
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getCollectionForMap: () => 'c',
    getCollectionSettings: () => settings,
  } as unknown as AssetService);
}

/** The catalogue over real catalogue sources for rules, and a saved map with two combatants. */
function openedShare(running: boolean): Promise<ReturnType<typeof parseMapPayload>> {
  const { app } = createInMemoryApp();
  const real = obsidianCatalogueSources(app as never, { getOnlineSettings: () => ({ shareableProperties: [] }), getLocalPlayerViewSettings: () => ({}) } as unknown as SettingsService);
  const map = migrateMapFile({
    background: 'maps/inn.png',
    objects: { tokens: {
      hero: { id: 'hero', kind: 'character', x: 70, y: 70, imagePath: 'art/hero.png', name: 'Hero', side: 'players' },
      orc: { id: 'orc', kind: 'character', x: 140, y: 70, imagePath: 'art/orc.png', name: 'Orc' },
    } },
  });
  const initiative = {
    entries: [
      { id: 'e1', tokenId: 'hero', name: 'Hero', initiative: 17, initiativeModifier: 0, imagePath: '', isActive: true, isNPC: false, order: 0 },
      { id: 'e2', tokenId: 'orc', name: 'Orc', initiative: 23, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order: 1 },
    ],
    currentIndex: 0, round: 1, isActive: running, config: { autoSort: true },
    ...(running ? { sides: { first: 'players', active: 'players' } } : {}),
  };
  const sources: CatalogueSources = {
    ...real,
    notes: () => [],
    read: async () => '',
    maps: async () => [{ name: 'Inn', mapPath: 'm.atlasmap', share: { item: 'm'.repeat(22), everyone: false, people: [`${T}/ben`], except: [], mode: 'player-safe', notes: [] } }],
    readMap: async () => ({ map, state: { ...map, objects: { ...map.objects, audios: {} }, widgetValues: {}, initiative, initiativeTrackerOpen: true } as never, extra: {}, lit: false }),
    images: memoryImageFiles({ 'maps/inn.png': 'png-bytes', 'art/hero.png': 'a', 'art/orc.png': 'b' }).source,
    isFile: () => false,
    rules: () => ({ showGrid: true, showTokenNameplates: true, showWidgets: true, showInitiative: true }),
    collectionGrid: () => null,
  };
  const catalogue = new SenderCatalogue(sources, items, people as never, nodeHash, async () => ({ width: 100, height: 100 }));
  return catalogue.list(ben).then(async (list) => {
    const mapItem = list.find((item) => item.kind === 'map');
    const opened = mapItem ? await catalogue.open(ben, mapItem.item) : null;
    return opened ? parseMapPayload(JSON.parse(new TextDecoder().decode(opened.bytes))) : null;
  });
}

describe('a player-safe share follows the rules of live play', () => {
  it("opens cones by the game system's angle, as the live scene does: D&D 5e without grid defaults gives 53.13", async () => {
    collection({ systemPresetId: builtInPresetId('dnd5e') });
    const payload = await openedShare(false);
    expect(payload?.mode).toBe('player-safe');
    expect(payload?.mode === 'player-safe' && payload.scene.measurement.coneAngle).toBe(53.13);
  });

  it('keeps a stored angle, and falls back to a quarter circle for one no cone can open with', async () => {
    collection({ gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric', coneAngle: 60 } });
    expect((await openedShare(false) as { scene: { measurement: { coneAngle: number } } }).scene.measurement.coneAngle).toBe(60);
    collection({ gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric', coneAngle: 500 } });
    expect((await openedShare(false) as { scene: { measurement: { coneAngle: number } } }).scene.measurement.coneAngle).toBe(90);
  });

  it('lists a by-sides collection by sides before a fight, with no initiative numbers in the share', async () => {
    collection({ systemPresetId: builtInPresetId('cairn') });
    const payload = await openedShare(false) as { scene: { initiative: { sides?: unknown; entries: Array<{ initiative: number }> } } };
    expect(payload.scene.initiative.sides).toEqual({ first: 'players' });
    expect(payload.scene.initiative.entries.map((entry) => entry.initiative)).toEqual([0, 0]);
    expect(JSON.stringify(payload)).not.toMatch(/"initiative":(17|23)\b/);
  });

  it('lists a turn-order collection with its numbers', async () => {
    collection({ systemPresetId: builtInPresetId('dnd5e') });
    const payload = await openedShare(false) as { scene: { initiative: { sides?: unknown; entries: Array<{ initiative: number }> } } };
    expect(payload.scene.initiative.sides).toBeUndefined();
    expect(payload.scene.initiative.entries.map((entry) => entry.initiative)).toEqual([17, 23]);
  });
});
