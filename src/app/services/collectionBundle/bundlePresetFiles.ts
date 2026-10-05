import type { App } from 'obsidian';
import type { CollectionSettings } from '../../types/collectionSettingsTypes';
import { planPresets, presetFingerprint, type PackedPreset, type PlannedPreset, type VaultPreset } from '../systemPresets/bundlePresets';
import { freePresetPath, presetText, readPresetText } from '../systemPresets/presetFiles';
import { SystemPresetFiles } from '../systemPresets/SystemPresetFiles';
import { toBuffer } from './bundleContent';
import { PRESET_ROLE, type BundleFile, type CollectionBundleManifest } from './bundleFormat';
import type { BundleFileReader } from './bundleReader';
import type { ImportJournal } from './importJournal';
import type { InstalledPreset, InstallRecord } from './installRecord';

/**
 * `files` with the file of the user preset the collection's settings name, so a collection
 * travels with its game system. A built-in preset never travels: every Atlas has it.
 */
export function withSystemPresetFile(app: App, files: readonly BundleFile[], settings: CollectionSettings): BundleFile[] {
  const id = settings.systemPresetId;
  const path = id ? SystemPresetFiles.forApp(app)?.pathOf(id) : null;
  if (!path || files.some((file) => file.vaultPath === path)) return [...files];
  return [...files, { vaultPath: path, role: PRESET_ROLE }];
}

/** Writes the preset edits not yet on disk, so an export packs what the user sees. */
export async function flushPresetEdits(app: App): Promise<void> {
  await SystemPresetFiles.forApp(app)?.flush();
}

/** What the publisher's install record keeps of a preset file the export packs; null for a file that holds no preset. */
export async function packedPresetRecord(content: ArrayBuffer): Promise<InstalledPreset | null> {
  const entry = readPresetText(new TextDecoder().decode(content));
  if (!entry) return null;
  const fingerprint = await presetFingerprint(entry);
  return { localId: entry.id, source: fingerprint, installed: fingerprint };
}

/** The presets a bundle carries; the first file of an id holds it, and a file that holds no preset is left out. */
async function readBundlePresets(files: readonly BundleFile[], read: (path: string) => Promise<string | null>): Promise<PackedPreset[]> {
  const presets = new Map<string, PackedPreset>();
  for (const file of files) {
    if (file.role !== PRESET_ROLE) continue;
    const text = await read(file.vaultPath);
    const entry = text === null ? null : readPresetText(text);
    if (entry && !presets.has(entry.id)) presets.set(entry.id, { path: file.vaultPath, entry, fingerprint: await presetFingerprint(entry) });
  }
  return [...presets.values()];
}

/** The vault's user presets by id, with their edits written first. */
async function vaultPresets(app: App): Promise<Map<string, VaultPreset>> {
  const store = SystemPresetFiles.forApp(app);
  if (!store) return new Map();
  await store.load();
  await store.flush();
  const presets = new Map<string, VaultPreset>();
  for (const entry of store.entries()) {
    const path = store.pathOf(entry.id);
    const name = typeof entry.name === 'string' ? entry.name : '';
    if (path) presets.set(entry.id, { id: entry.id, path, name, fingerprint: await presetFingerprint(entry) });
  }
  return presets;
}

/** Whether a file other than one the plan gave out has this path, in any letter case. */
function pathTaken(app: App, path: string): boolean {
  if (app.vault.getAbstractFileByPath(path)) return true;
  const lower = path.toLowerCase();
  const siblings = app.vault.getFolderByPath(path.slice(0, path.lastIndexOf('/')))?.children ?? [];
  return siblings.some((child) => child.path.toLowerCase() === lower);
}

/**
 * Reads the bundle's presets and decides, by preset id, what becomes of each (`planPresets`). A
 * copy is named after the collection ("Homebrew (Fen)"), new files go to the presets folder.
 */
export async function planPresetImport(
  app: App,
  manifest: CollectionBundleManifest,
  files: BundleFileReader,
  record: InstallRecord | null,
  collectionName: string,
): Promise<PlannedPreset[]> {
  const bundle = await readBundlePresets(manifest.files, (path) => files.text(path));
  if (bundle.length === 0) return [];
  const vault = await vaultPresets(app);
  const claimedPaths = new Set<string>();
  const claimedNames = new Set([...vault.values()].map((preset) => preset.name.toLowerCase()));
  return planPresets(bundle, vault, record?.presets, {
    place: (name) => {
      const path = freePresetPath(name, (candidate) => claimedPaths.has(candidate.toLowerCase()) || pathTaken(app, candidate));
      claimedPaths.add(path.toLowerCase());
      return path;
    },
    copyName: (name) => {
      const marked = `${name} (${collectionName})`;
      let copy = marked;
      for (let n = 2; claimedNames.has(copy.toLowerCase()); n++) copy = `${marked} ${n}`;
      claimedNames.add(copy.toLowerCase());
      return copy;
    },
    newId: () => crypto.randomUUID(),
  });
}

/** Whether the vault's presets changed since the review: one the decision read differs now, or a file took a new one's path. */
export async function presetsChangedSinceReview(app: App, planned: readonly PlannedPreset[]): Promise<boolean> {
  if (planned.length === 0) return false;
  const vault = await vaultPresets(app);
  return planned.some((preset) => (preset.mine === null
    ? pathTaken(app, preset.target)
    : vault.get(preset.localId)?.fingerprint !== preset.mine));
}

/** Writes the presets the plan brings in or updates, through the import's journal; returns how many. */
export async function writePresets(app: App, journal: Pick<ImportJournal, 'write'>, planned: readonly PlannedPreset[]): Promise<number> {
  let written = 0;
  for (const preset of planned) {
    if (!preset.entry) continue;
    const text = presetText(preset.entry);
    await journal.write(preset.target, toBuffer(text));
    SystemPresetFiles.forApp(app)?.recordWrite(preset.target, text);
    written += 1;
  }
  return written;
}
