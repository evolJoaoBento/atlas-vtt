import type { Disposer, Json } from './common';
import type { BackgroundState, GridState, InitiativeState, SceneLighting } from './records';
import type { SceneSnapshot } from './views';

export interface SceneRecord { id: string; name: string; collectionId: string; mapPath: string | null }

/** The parts of a saved map an extension may read and write; everything else in the file stays Atlas's. */
export interface SavedMapInput {
  /** As in `SceneSnapshot`. Written with `addToCollection`, image paths are relative to its `images` and become vault paths; `readMap` returns vault paths. */
  background: BackgroundState; grid: GridState | null; objects: SceneSnapshot['objects'];
  widgets: SceneSnapshot['widgets']; initiative: InitiativeState; lighting?: SceneLighting;
}

export interface ScenesApi {
  list(): Promise<SceneRecord[]>;
  findByMap(mapPath: string): Promise<SceneRecord | null>;
  /** This extension's data on the scene record (`data.extensions[<extension id>]`); a frozen copy, undefined when unset. */
  getData(sceneId: string): Promise<Json | undefined>;
  /** Sets or (null) clears it. Atlas drops it from copies, exports and imports, and leaves it out of fingerprints. */
  setData(sceneId: string, value: Json | null): Promise<void>;
  /** A saved `.atlasmap` file, migrated to the current format, without opening a view; a frozen copy. Null when there is no such file. */
  readMap(mapPath: string): Promise<(SavedMapInput & { mapSize: { width: number; height: number } }) | null>;
  /**
   * Writes the images and the map file into `folder` (inside the collection's folder) and adds the scene record,
   * all under the asset index lock; on failure nothing is left behind. Creates the collection by name when
   * none of that name exists. A path in `images` that is absolute or climbs out of `folder` is refused.
   */
  addToCollection(input: {
    collection: { id: string } | { name: string };
    name: string; folder: string; map: SavedMapInput;
    images: ReadonlyArray<{ path: string; data: ArrayBuffer }>;
  }): Promise<{ sceneId: string; mapPath: string }>;
}

export interface BundlesApi {
  /** Frontmatter keys removed from notes when a collection is exported and when a bundle is installed (e.g. 'atlas-share'). */
  stripNoteProperties(keys: readonly string[]): Disposer;
}
