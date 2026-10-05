import { describe, expect, it, vi } from 'vitest';
import { DEVICE_KEYS_STORAGE, DeviceKeys, memoryKeyValueStore } from '../../../../src/app/online/sharing/identity/deviceKeys';
import { ensureTableIdentity, moveTableKeyToDevice, ownOldTableKey, TABLE_KEY_STORAGE, tableKeyStore } from '../../../../src/app/online/sharing/identity/tableKey';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { DEFAULT_ONLINE_SETTINGS, resolveOnlineSettings, type OnlineSettings, type StoredTable } from '../../../../src/app/online/onlineSettings';
import { nodeIdentityCrypto as crypto } from './sharingFixtures';

describe('device keys', () => {
  it('keeps one key per table on the device, made once', async () => {
    const store = memoryKeyValueStore();
    const generate = vi.spyOn(crypto, 'generate');
    const keys = new DeviceKeys(store, crypto);
    const [a, again] = await Promise.all([keys.forTable('table-a'), keys.forTable('table-a')]);
    expect(again).toEqual(a);
    expect(generate).toHaveBeenCalledTimes(1);
    const b = await keys.forTable('table-b');
    expect(b.publicKey).not.toBe(a.publicKey);
    // A new service on the same device finds them.
    expect(await new DeviceKeys(store, crypto).forTable('table-a')).toEqual(a);
    generate.mockRestore();
  });

  it('replaces a broken stored key', async () => {
    const store = memoryKeyValueStore();
    store.set(DEVICE_KEYS_STORAGE, { 'table-a': { publicKey: 1, privateKey: 'x' } });
    const keys = await new DeviceKeys(store, crypto).forTable('table-a');
    expect(typeof keys.publicKey).toBe('string');
    expect(keys.privateKey).toMatchObject({ kty: 'EC', crv: 'P-256' });
  });
});

describe('table key', () => {
  /** The synced settings as the table key's move sees them. */
  function settings(table: StoredTable | null = null): { getOnlineSettings(): OnlineSettings; setOnlineSettings(partial: Partial<OnlineSettings>): void } {
    let online = { ...DEFAULT_ONLINE_SETTINGS, table };
    return { getOnlineSettings: () => online, setOnlineSettings: (partial) => { online = { ...online, ...partial }; } };
  }

  async function tableOf(): Promise<StoredTable> {
    const keys = await crypto.generate();
    return { id: await crypto.keyId(keys.publicKey), publicKey: keys.publicKey, privateKey: keys.privateKey };
  }

  it('is made on first use, kept on the device and stable', async () => {
    const local = memoryKeyValueStore();
    const first = await ensureTableIdentity(tableKeyStore(local), crypto);
    expect(first.id).toBe(await crypto.keyId(first.keys.publicKey));
    expect(local.get(TABLE_KEY_STORAGE)).toEqual({ id: first.id, publicKey: first.keys.publicKey, privateKey: first.keys.privateKey });
    expect(await ensureTableIdentity(tableKeyStore(local), crypto)).toEqual(first);
  });

  it('replaces a broken stored key, and reads the synced settings of any shape', async () => {
    const local = memoryKeyValueStore();
    local.set(TABLE_KEY_STORAGE, { id: 'short', publicKey: 'x', privateKey: {} });
    const made = await ensureTableIdentity(tableKeyStore(local), crypto);
    expect(tableKeyStore(local).get()?.id).toBe(made.id);
    expect(resolveOnlineSettings({ table: { id: 'short', publicKey: made.keys.publicKey, privateKey: {} } }).table).toBeNull();
    expect(resolveOnlineSettings({}).table).toBeNull();
  });

  it('moves this device\'s key out of the synced settings into local storage, and strips it from them', async () => {
    const own = await tableOf();
    const synced = settings(own);
    const local = memoryKeyValueStore();
    moveTableKeyToDevice(synced, tableKeyStore(local), own);
    expect(tableKeyStore(local).get()).toEqual(own);
    expect(synced.getOnlineSettings().table).toBeNull();
    // The same table hosts on: its id is unchanged.
    expect((await ensureTableIdentity(tableKeyStore(local), crypto)).id).toBe(own.id);
  });

  it('keeps the key this device holds already: the local one wins', async () => {
    const kept = await tableOf();
    const synced = settings(await tableOf());
    const local = memoryKeyValueStore();
    tableKeyStore(local).set(kept);
    moveTableKeyToDevice(synced, tableKeyStore(local), await tableOf());
    expect(tableKeyStore(local).get()).toEqual(kept);
    expect(synced.getOnlineSettings().table).toBeNull();
  });

  it('lets a second device, with the synced settings but no key of its own, host a table of its own, as before 0.6', async () => {
    const first = await tableOf();
    const synced = settings(first);
    const local = memoryKeyValueStore();
    moveTableKeyToDevice(synced, tableKeyStore(local), null);
    expect(tableKeyStore(local).get()).toBeNull();
    expect(synced.getOnlineSettings().table).toBeNull();
    const own = await ensureTableIdentity(tableKeyStore(local), crypto);
    expect(own.id).not.toBe(first.id);
    expect(synced.getOnlineSettings().table).toBeNull();
  });

  it('loses nothing when the move is interrupted or the device cannot keep the key', async () => {
    const own = await tableOf();
    // The local write does not hold (storage blocked, or the start ended before it read back).
    const broken = { get: (): unknown => null, set: (): void => {} };
    const synced = settings(own);
    moveTableKeyToDevice(synced, tableKeyStore(broken), own);
    expect(synced.getOnlineSettings().table).toEqual(own);
    // Interrupted after the local copy was written, before the synced one was cleared: the next start finishes.
    const local = memoryKeyValueStore();
    tableKeyStore(local).set(own);
    moveTableKeyToDevice(synced, tableKeyStore(local), own);
    expect(tableKeyStore(local).get()).toEqual(own);
    expect(synced.getOnlineSettings().table).toBeNull();
  });

  it('reads this device\'s key from its old settings file, which it never changes', async () => {
    const own = await tableOf();
    const file = JSON.stringify({ diceColour: 'dark', online: { playerName: 'Guy', table: own } });
    const { app, files } = createInMemoryApp({ files: { 'atlas-vtt/.atlas-data/settings.json': file } });
    expect(await ownOldTableKey(app)).toEqual(own);
    expect(files.get('atlas-vtt/.atlas-data/settings.json')).toBe(file);
    expect(await ownOldTableKey(createInMemoryApp().app)).toBeNull();
  });
});
