/**
 * The GM's table key: made the first time this device hosts, then stable. It stays on this
 * device, in Obsidian's local storage (one per vault), like a player's device keys
 * (`deviceKeys.ts`). Never in a synced file: a group that shares one vault with its players
 * would otherwise hand them the GM's table identity. A second device hosts a table of its own.
 */
import type { App } from 'obsidian';
import { validStoredTable, type OnlineSettings, type StoredTable } from '../../onlineSettings';
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

export interface SyncedTableSettings {
  getOnlineSettings(): Pick<OnlineSettings, 'table'>;
  setOnlineSettings(settings: Pick<OnlineSettings, 'table'>): void;
}

/**
 * Takes the table key out of the synced settings, once. Atlas 0.6's settings migration carried
 * the old settings file, the table key with it, into the plugin's synced data.
 * - This device keeps the key of its own old settings file (`own`; the file is never changed),
 *   unless it keeps one already: the local one wins. A key that only the synced settings hold
 *   came from another device and is not taken: this device hosts its own table, as before 0.6.
 * - The synced copy is cleared only once this device's key is written and read back, so an
 *   interrupted or failed move loses nothing: the next start moves it again.
 */
export function moveTableKeyToDevice(settings: SyncedTableSettings, store: TableKeyStore, own: StoredTable | null): void {
  if (!store.get() && own && !store.set(own)) {
    console.error('[Atlas online] Could not move the table key to this device; it stays where it is until the next start.');
    return;
  }
  if (settings.getOnlineSettings().table !== null) settings.setOnlineSettings({ table: null });
}

/** Where Atlas kept its settings before 0.6, on this device (`plugin/settingsMigration.ts`). */
const OLD_SETTINGS_PATHS = ['atlas-vtt/.atlas-data/settings.json', 'atlas-vtt/settings.json'];

/** The table key of this device's old settings file, if it has one. */
export async function ownOldTableKey(app: App): Promise<StoredTable | null> {
  const { adapter } = app.vault;
  for (const path of OLD_SETTINGS_PATHS) {
    try {
      if (!(await adapter.exists(path))) continue;
      const parsed: unknown = JSON.parse(await adapter.read(path));
      const online = typeof parsed === 'object' && parsed !== null ? (parsed as { online?: unknown }).online : undefined;
      return validStoredTable(typeof online === 'object' && online !== null ? (online as { table?: unknown }).table : null);
    } catch (error) {
      console.error(`[Atlas online] The old settings in ${path} could not be read:`, error);
      return null;
    }
  }
  return null;
}
