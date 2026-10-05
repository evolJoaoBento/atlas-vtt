import { TAbstractFile, TFile, type App, type EventRef } from 'obsidian';
import type { PresetStorage } from '../SystemPresetService';
import {
  SYSTEM_PRESET_FOLDER,
  freePresetPath,
  isNamedAfter,
  isPresetPath,
  isWithin,
  presetText,
  readPresetText,
  type StoredPreset,
} from './presetFiles';

interface PresetFile {
  text: string;
  /** Null for a file that holds no preset (broken JSON, no id). */
  preset: StoredPreset | null;
}

const folderOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));

/**
 * The user's game system presets as vault files (`presetFiles.ts`), one per preset, so they
 * sync and travel like any other file. It follows creates, edits, deletes and renames (a sync
 * delivering another device's change), recognises its own writes by their text and tells its
 * listeners about every change. Where two files hold one id (a conflict copy) the lower path
 * holds it. Edits are taken in at once and written in order in the background (`flush`).
 *
 * One per app, opened by the plugin and released when it unloads.
 */
export class SystemPresetFiles implements PresetStorage {
  private static readonly instances = new WeakMap<App, SystemPresetFiles>();

  static open(app: App): SystemPresetFiles {
    let files = SystemPresetFiles.instances.get(app);
    if (!files) {
      files = new SystemPresetFiles(app);
      SystemPresetFiles.instances.set(app, files);
    }
    return files;
  }

  /** The app's presets once the plugin opened them; undefined before (and in tests that open none). */
  static forApp(app: App | undefined): SystemPresetFiles | undefined {
    return app ? SystemPresetFiles.instances.get(app) : undefined;
  }

  static release(app: App): void {
    SystemPresetFiles.instances.get(app)?.destroy();
    SystemPresetFiles.instances.delete(app);
  }

  private readonly files = new Map<string, PresetFile>();
  /** Raised for a path whenever an event makes a read of it under way stale. */
  private readonly versions = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private readonly refs: EventRef[] = [];
  private cache: StoredPreset[] | null = null;
  private writes: Promise<void> = Promise.resolve();
  private loading: Promise<void> | null = null;

  private constructor(private readonly app: App) {
    const { vault } = app;
    this.refs.push(
      vault.on('create', (file) => this.written(file)),
      vault.on('modify', (file) => this.written(file)),
      vault.on('delete', (file) => this.deleted(file.path)),
      vault.on('rename', (file, oldPath) => this.renamed(file, oldPath)),
    );
  }

  /** Reads the presets folder once, through the adapter, which does not wait for the vault's index. */
  load(): Promise<void> {
    return (this.loading ??= this.readFolder(SYSTEM_PRESET_FOLDER));
  }

  /** The stored presets, the first file per id by path; the same array while nothing changed. */
  entries(): readonly StoredPreset[] {
    if (this.cache) return this.cache;
    const seen = new Set<string>();
    this.cache = [...this.files.keys()].sort().flatMap((path) => {
      const preset = this.files.get(path)?.preset;
      if (!preset || seen.has(preset.id)) return [];
      seen.add(preset.id);
      return [preset];
    });
    return this.cache;
  }

  /** The file that holds the preset `id`, or null when none does. */
  pathOf(id: string): string | null {
    return [...this.files.keys()].sort().find((path) => this.files.get(path)?.preset?.id === id) ?? null;
  }

  /**
   * Writes a new preset file. `apart` names it with a piece of its id: devices that carry their
   * presets over at once could otherwise each write a file of the same name, of which sync keeps
   * one. Its next edit gives it the plain name when that is free.
   */
  create(entry: StoredPreset, apart = false): void {
    const name = apart ? `${typeof entry.name === 'string' ? entry.name : ''} (${entry.id.slice(-6)})` : entry.name;
    const path = freePresetPath(name, (candidate) => this.isTaken(candidate));
    this.bump(path);
    this.files.set(path, { text: presetText(entry), preset: entry });
    this.changed();
    this.enqueue(() => this.writeNew(entry.id));
  }

  /** Changes the preset; on disk the change is applied to what the file holds then, so a field another device wrote survives. */
  update(id: string, change: (stored: StoredPreset) => StoredPreset): void {
    const path = this.pathOf(id);
    const preset = path ? this.files.get(path)?.preset : null;
    if (!path || !preset) throw new Error(`No preset file holds ${id}`);
    const next = change(preset);
    this.bump(path);
    this.files.set(path, { text: presetText(next), preset: next });
    this.changed();
    this.enqueue(() => this.writeChange(id, change));
  }

  /** Removes every file that holds the preset, conflict copies included, so none brings it back. */
  remove(id: string): void {
    const paths = [...this.files.keys()].filter((path) => this.files.get(path)?.preset?.id === id);
    if (paths.length === 0) return;
    for (const path of paths) this.files.delete(path);
    this.changed();
    this.enqueue(async () => {
      for (const path of paths) {
        const file = this.app.vault.getFileByPath(path);
        if (file) await this.app.fileManager.trashFile(file);
      }
    });
  }

  /**
   * Text another part of Atlas has just written to a preset file (a collection import), taken in
   * without waiting for the vault's event, which then finds it known.
   */
  recordWrite(path: string, text: string): void {
    if (!isPresetPath(path) || this.files.get(path)?.text === text) return;
    this.bump(path);
    this.files.set(path, { text, preset: readPresetText(text) });
    this.changed();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Settles once every edit made so far is on disk. */
  flush(): Promise<void> {
    return this.writes;
  }

  destroy(): void {
    for (const ref of this.refs.splice(0)) this.app.vault.offref(ref);
    this.listeners.clear();
  }

  private enqueue(write: () => Promise<void>): void {
    this.writes = this.writes.then(write).catch((error: unknown) => {
      console.error('[Atlas] Writing a system preset file failed:', error);
    });
  }

  private async writeNew(id: string): Promise<void> {
    let path = this.pathOf(id);
    const entry = path ? this.files.get(path) : undefined;
    if (!path || !entry) return;
    const { vault } = this.app;
    if (vault.getAbstractFileByPath(path)) {
      // Another file took the name meanwhile (a sync); this one takes the next free name.
      this.files.delete(path);
      path = freePresetPath(entry.preset?.name, (candidate) => this.isTaken(candidate));
      this.files.set(path, entry);
    }
    if (!vault.getFolderByPath(SYSTEM_PRESET_FOLDER)) await vault.createFolder(SYSTEM_PRESET_FOLDER).catch(() => undefined);
    await vault.create(path, entry.text);
  }

  private async writeChange(id: string, change: (stored: StoredPreset) => StoredPreset): Promise<void> {
    const path = this.pathOf(id);
    const file = path ? this.app.vault.getFileByPath(path) : null;
    if (!path || !file) return;
    let written = '';
    await this.app.vault.process(file, (text) => {
      const onDisk = readPresetText(text);
      // A file that no longer holds the preset is left as it is.
      written = onDisk?.id === id ? presetText(change(onDisk)) : text;
      return written;
    });
    if (this.files.get(path)?.text !== written) {
      this.files.set(path, { text: written, preset: readPresetText(written) });
      this.changed();
    }
    await this.followName(id, file);
  }

  /** A renamed preset's file takes the new name. */
  private async followName(id: string, file: TFile): Promise<void> {
    const path = file.path;
    const name = this.files.get(path)?.preset?.name;
    if (this.pathOf(id) !== path || isNamedAfter(path, name)) return;
    const target = freePresetPath(name, (candidate) => this.isTaken(candidate, path));
    if (target === path) return;
    await this.app.fileManager.renameFile(file, target);
    this.move(path, target);
  }

  private isTaken(path: string, except: string | null = null): boolean {
    const lower = path.toLowerCase();
    if (except !== null && except.toLowerCase() === lower) return false;
    if ([...this.files.keys()].some((known) => known.toLowerCase() === lower)) return true;
    if (this.app.vault.getAbstractFileByPath(path)) return true;
    const siblings = this.app.vault.getFolderByPath(folderOf(path))?.children ?? [];
    return siblings.some((child) => child.path.toLowerCase() === lower);
  }

  private async readFolder(folder: string): Promise<void> {
    const { adapter } = this.app.vault;
    if (!(await adapter.exists(folder))) return;
    const listed = await adapter.list(folder);
    for (const path of listed.files) if (isPresetPath(path)) await this.read(path, () => adapter.read(path));
    for (const child of listed.folders) await this.readFolder(child);
  }

  private written(file: TAbstractFile): void {
    if (!(file instanceof TFile) || !isPresetPath(file.path)) return;
    void this.read(file.path, () => this.app.vault.read(file));
  }

  private async read(path: string, text: () => Promise<string>): Promise<void> {
    const version = this.bump(path);
    let read: string;
    try {
      read = await text();
    } catch (error) {
      console.error(`[Atlas] Could not read the system preset ${path}:`, error);
      return;
    }
    if (this.versions.get(path) !== version || this.files.get(path)?.text === read) return;
    this.files.set(path, { text: read, preset: readPresetText(read) });
    this.changed();
  }

  private deleted(path: string): void {
    const gone = [...this.files.keys()].filter((known) => isWithin(known, path));
    for (const known of gone) {
      this.bump(known);
      this.files.delete(known);
    }
    if (gone.length > 0) this.changed();
  }

  /** Files move without being read again; a file moved into the folder from elsewhere is read. */
  private renamed(file: TAbstractFile, oldPath: string): void {
    const moved = [...this.files.keys()].filter((known) => isWithin(known, oldPath));
    for (const known of moved) this.move(known, file.path + known.slice(oldPath.length));
    const arrived = file instanceof TFile ? [file] : this.app.vault.getFiles().filter((child) => isWithin(child.path, file.path));
    for (const child of arrived) if (!this.files.has(child.path)) this.written(child);
  }

  private move(from: string, to: string): void {
    const entry = this.files.get(from);
    if (!entry) return;
    this.bump(from);
    this.files.delete(from);
    if (isPresetPath(to)) this.files.set(to, entry);
    this.changed();
  }

  private bump(path: string): number {
    const version = (this.versions.get(path) ?? 0) + 1;
    this.versions.set(path, version);
    return version;
  }

  private changed(): void {
    this.cache = null;
    for (const listener of [...this.listeners]) listener();
  }
}
