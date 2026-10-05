/**
 * The GM's table key: made the first time this device hosts, then stable. It stays on this
 * device, in Obsidian's local storage (one per vault), like a player's device keys
 * (`deviceKeys.ts`). Never in a synced file: a group that shares one vault with its players
 * would otherwise hand them the GM's table identity. A second device hosts a table of its own.
 */
import type { App } from 'obsidian';
import { validStoredTable, type StoredTable } from '../../onlineSettings';
import type { KeyValueStore } from './deviceKeys';
import type { IdentityCrypto, TableIdentity } from './identityCrypto';

export const TABLE_KEY_STORAGE = 'atlas-online-table-key';

/** Where this device keeps its table key. */
export interface TableKeyStore {
  get(): StoredTable | null;
  /** Writes the key and reads it back; true only when what reads back is that key. */
  set(table: StoredTable): boolean;
}

const sameTable = (a: StoredTable | null, b: StoredTable): boolean =>
  a !== null && a.id === b.id && a.publicKey === b.publicKey && JSON.stringify(a.privateKey) === JSON.stringify(b.privateKey);

export function tableKeyStore(store: KeyValueStore): TableKeyStore {
  const get = (): StoredTable | null => validStoredTable(store.get(TABLE_KEY_STORAGE));
  return {
    get,
    set: (table) => {
      store.set(TABLE_KEY_STORAGE, table);
      return sameTable(get(), table);
    },
  };
}

/** This device's table: the one it keeps, else a new one, kept from now on. */
export async function ensureTableIdentity(store: TableKeyStore, crypto: IdentityCrypto): Promise<TableIdentity> {
  const stored = store.get();
  if (stored) return { id: stored.id, keys: { publicKey: stored.publicKey, privateKey: stored.privateKey } };
  const keys = await crypto.generate();
  const id = await crypto.keyId(keys.publicKey);
  if (!store.set({ id, publicKey: keys.publicKey, privateKey: keys.privateKey })) {
    console.error('[Atlas online] Could not keep the table key on this device; the next session hosts a new table.');
  }
  return { id, keys };
}

/**
 * Replaces this device's table key with a new one: for a key that reached someone else (a synced
 * or backed-up vault). Rejects, keeping the old key, when the new one cannot be kept on this device.
 */
export async function renewTableIdentity(store: TableKeyStore, crypto: IdentityCrypto): Promise<TableIdentity> {
  const keys = await crypto.generate();
  const id = await crypto.keyId(keys.publicKey);
  if (!store.set({ id, publicKey: keys.publicKey, privateKey: keys.privateKey })) throw new Error('The new table key could not be kept on this device');
  return { id, keys };
}

/** Where Atlas kept its settings before 0.6, on this device (`plugin/settingsMigration.ts`). */
const OLD_SETTINGS_PATHS = ['atlas-vtt/.atlas-data/settings.json', 'atlas-vtt/settings.json'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether settings (the plugin's data or an old settings file) hold a table key in `online.table`. */
export function hasTableKey(settings: unknown): boolean {
  return isRecord(settings) && isRecord(settings.online) && 'table' in settings.online;
}

/** `settings` without `online.table`, every other key kept; `settings` itself when it holds none. */
export function withoutTableKey(settings: unknown): unknown {
  if (!hasTableKey(settings)) return settings;
  const record = settings as Record<string, unknown> & { online: Record<string, unknown> };
  const { table: _table, ...online } = record.online;
  return { ...record, online };
}

/** What `saveData` and `loadData` take: Obsidian's plugin data, which syncs with the plugin's settings. */
export interface PluginData {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

/**
 * The plugin's data as Atlas reads and writes its settings through it: never with a table key. Given to Atlas
 * 0.6's settings migration (which carries the old settings file over whole) and to the settings service, so no
 * save puts the key into the synced file, and a copy another device left there is not read back in.
 */
export function withoutSyncedTableKey(data: PluginData): PluginData {
  return {
    loadData: async () => withoutTableKey(await data.loadData()),
    saveData: (value) => data.saveData(withoutTableKey(value)),
  };
}

/** The table key of this device's old settings file, if it has one. */
export async function ownOldTableKey(app: App): Promise<StoredTable | null> {
  const { adapter } = app.vault;
  for (const path of OLD_SETTINGS_PATHS) {
    try {
      if (!(await adapter.exists(path))) continue;
      const parsed: unknown = JSON.parse(await adapter.read(path));
      const online = isRecord(parsed) ? parsed.online : undefined;
      return validStoredTable(isRecord(online) ? online.table : null);
    } catch (error) {
      console.error(`[Atlas online] The old settings in ${path} could not be read:`, error);
      return null;
    }
  }
  return null;
}

/**
 * Removes the table key from the old settings files and the plugin's data, every other setting kept. Called
 * only once this device's key is written and read back (or it has none to keep). A failed rewrite only logs:
 * the local copy is safe, and the next start tries again.
 */
export async function stripTableKeyCopies(app: App, data: PluginData | null): Promise<void> {
  const { adapter } = app.vault;
  for (const path of OLD_SETTINGS_PATHS) {
    try {
      if (!(await adapter.exists(path))) continue;
      const parsed: unknown = JSON.parse(await adapter.read(path));
      if (hasTableKey(parsed)) await adapter.write(path, JSON.stringify(withoutTableKey(parsed), null, 2));
    } catch (error) {
      console.error(`[Atlas online] Could not take the table key out of ${path}:`, error);
    }
  }
  if (!data) return;
  try {
    const stored = await data.loadData();
    if (hasTableKey(stored)) await data.saveData(withoutTableKey(stored));
  } catch (error) {
    console.error('[Atlas online] Could not take the table key out of the plugin data:', error);
  }
}

/**
 * Keeps this device's own table key in local storage: the key of its own old settings file (`own`), unless it
 * keeps one already (the local one wins). A key only synced files hold came from another device and is not
 * taken: this device hosts its own table, as before 0.6. True once this device's key is safe (written and read
 * back, or there is none to keep); false when it could not be written, and nothing may be removed yet.
 */
export function moveTableKeyToDevice(store: TableKeyStore, own: StoredTable | null): boolean {
  if (store.get() || !own) return true;
  if (store.set(own)) return true;
  console.error('[Atlas online] Could not move the table key to this device; it stays where it is until the next start.');
  return false;
}

/** At start, before anything hosts: the key moves to this device, then every copy in a vault file goes. */
export async function moveTableKeyOnStart(app: App, store: TableKeyStore, data: PluginData): Promise<void> {
  if (moveTableKeyToDevice(store, await ownOldTableKey(app))) await stripTableKeyCopies(app, data);
}
