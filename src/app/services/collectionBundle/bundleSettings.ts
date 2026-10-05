import { BUILT_IN_SYSTEM_PRESETS } from '../../gameSystems/builtInPresets';
import { legacyCollectionResources } from '../../resources/collectionResources';
import { sameResourceDefinitions } from '../../resources/resourceDefinitions';
import type { CollectionSettings } from '../../types/collectionSettingsTypes';
import type { CollectionMetadata } from '../AssetService';

/**
 * A collection's settings as bundles compare them. Resources that only restate what the
 * settings read as before resources were stored are left out: Atlas stores them by itself
 * (`storeLegacyResources`), which is no edit of the GM's. Nor is what players see.
 */
export function comparableSettings(settings: CollectionSettings | undefined): CollectionSettings | Omit<CollectionSettings, 'resources'> | undefined {
  if (!settings?.resources) return settings;
  const { resources, ...rest } = settings;
  return sameResourceDefinitions(resources, legacyCollectionResources(rest, BUILT_IN_SYSTEM_PRESETS)) ? rest : settings;
}

/** `settings` with each loot base at the path `pathOf` gives it; a base without one is left out. */
export function withLootBases(settings: CollectionSettings, pathOf: (path: string) => string | undefined): CollectionSettings {
  const { lootBases } = settings;
  return lootBases ? { ...settings, lootBases: lootBases.flatMap((path) => pathOf(path) ?? []) } : settings;
}

/** The settings an import takes from a bundle. One written by an older Atlas names no resources: the vault keeps its own. */
export function settingsFromBundle(theirs: CollectionSettings, mine: CollectionSettings | undefined): CollectionSettings {
  return theirs.resources || !mine?.resources ? theirs : { ...theirs, resources: mine.resources };
}

/** Where an import puts what the bundle's settings point at. */
export interface ImportedPlaces {
  /** Bundle path → vault path. */
  paths: ReadonlyMap<string, string>;
  /** Bundle preset id → id here, where the vault's own preset differed and the bundle's came in as a copy. */
  presetIds?: ReadonlyMap<string, string> | undefined;
}

/** Settings whose game system is the preset's id in this vault. */
export function withPresetId<T extends { systemPresetId?: string | undefined }>(settings: T, ids: ReadonlyMap<string, string> | undefined): T {
  const id = settings.systemPresetId && ids?.get(settings.systemPresetId);
  return id ? { ...settings, systemPresetId: id } : settings;
}

/** The bundle's settings as the import stores them: its loot bases at the paths they get in this vault, its game system the preset's id here. */
export function importedSettings(collection: CollectionMetadata, places: ImportedPlaces): CollectionSettings {
  return withPresetId(withLootBases(collection.settings, (path) => places.paths.get(path) ?? path), places.presetIds);
}
