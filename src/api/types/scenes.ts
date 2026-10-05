import type { Disposer, Json } from './common';
import type {
  BackgroundState, GridState, InitiativeState, LightSource, NotePin, SceneLighting, TokenSettings, WallSegment,
} from './records';
import type { SceneSnapshot } from './views';

export interface SceneRecord { id: string; name: string; collectionId: string; mapPath: string | null }

/** The parts of a saved map an extension may read and write; everything else in the file stays Atlas's. */
export interface SavedMapInput {
  /** As in `SceneSnapshot`. Written with `addToCollection`, image paths are relative to its `images` and become vault paths; `readMap` returns vault paths. */
  background: BackgroundState; grid: GridState | null; objects: SceneSnapshot['objects'];
  widgets: SceneSnapshot['widgets']; initiative: InitiativeState; lighting?: SceneLighting;
}

/**
 * A saved map as `readMap` reads it: its `SavedMapInput`, the background's size, and the rest of the scene as saved.
 * Atlas 1.13.0 and later always set the optional fields, normalised as Atlas loads the map, also for a file that lacks
 * them; an older Atlas leaves them out.
 */
export type SavedMap = SavedMapInput & {
  mapSize: { width: number; height: number };
  /** The note pins, with their note links (vault paths), as saved; {} without any. */
  pins?: Readonly<Record<string, NotePin>>;
  /** The walls and lights of dynamic lighting, as saved; {} without any. */
  walls?: Readonly<Record<string, WallSegment>>;
  lights?: Readonly<Record<string, LightSource>>;
  /** Where the GM's camera was when the map was saved; x 0, y 0, scale 1 without one. */
  camera?: { x: number; y: number; scale: number };
  /** How the map shows its tokens; Atlas's defaults fill what the file does not set. */
  tokenSettings?: TokenSettings;
  /** Whether the initiative tracker was open; false when the file does not say. */
  initiativeTrackerOpen?: boolean;
};

export interface ScenesApi {
  list(): Promise<SceneRecord[]>;
  findByMap(mapPath: string): Promise<SceneRecord | null>;
  /** This extension's data on the scene record (`data.extensions[<extension id>]`); a frozen copy, undefined when unset. */
  getData(sceneId: string): Promise<Json | undefined>;
  /** Sets or (null) clears it. Atlas drops it from copies, exports and imports, and leaves it out of fingerprints. */
  setData(sceneId: string, value: Json | null): Promise<void>;
  /** A saved `.atlasmap` file, migrated to the current format, without opening a view; a frozen copy. Null when there is no such file. */
  readMap(mapPath: string): Promise<SavedMap | null>;
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
  /**
   * Frontmatter keys removed from notes when a collection is exported and when a bundle is installed (e.g. 'atlas-share').
   * Atlas remembers them per extension id, so they stay stripped when the extension is not loaded (switched off, or
   * Atlas starting first). Unloading the extension does not forget them; calling the returned disposer does, and that
   * is the only thing that does. Handing the disposer to Obsidian's `this.register()` therefore forgets the keys on
   * every unload, which is usually not wanted: keep it for an extension that really stops stripping.
   * The keys of an extension that crashed or was uninstalled stay until something calls the disposer, or
   * `forgetNoteProperties`.
   */
  stripNoteProperties(keys: readonly string[]): Disposer;
  /** Forgets every note property this extension asked Atlas to strip, also those remembered from earlier sessions. Keys it registered in this session keep stripping until it unloads. */
  forgetNoteProperties(): void;
}
