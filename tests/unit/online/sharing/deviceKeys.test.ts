import { describe, expect, it, vi } from 'vitest';
import { DEVICE_KEYS_STORAGE, DeviceKeys, memoryKeyValueStore } from '../../../../src/app/online/sharing/identity/deviceKeys';
import { ensureTableIdentity, moveTableKeyOnStart, moveTableKeyToDevice, ownOldTableKey, TABLE_KEY_STORAGE, tableKeyStore, withoutSyncedTableKey } from '../../../../src/app/online/sharing/identity/tableKey';
import { memoryPluginData } from '../../../mocks/pluginData';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import type { StoredTable } from '../../../../src/app/online/onlineSettings';
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
  const OLD = 'atlas-vtt/.atlas-data/settings.json';

  async function tableOf(): Promise<StoredTable> {
    const keys = await crypto.generate();
    return { id: await crypto.keyId(keys.publicKey), publicKey: keys.publicKey, privateKey: keys.privateKey };
  }

  /** A device: its vault (with an old settings file holding `table`, if given), its synced plugin data and its local storage. */
  function device(table: StoredTable | null, data: unknown = table ? { diceColour: 'dark', online: { playerName: 'Guy', table } } : null) {
    const old = table ? JSON.stringify({ diceColour: 'dark', online: { playerName: 'Guy', keepImages: false, table } }) : null;
    const vault = createInMemoryApp({ files: old ? { [OLD]: old } : {} });
    const plugin = memoryPluginData(data);
    const local = memoryKeyValueStore();
    return { ...vault, plugin, local, keys: tableKeyStore(local) };
  }

  it('is made on first use, kept on the device and stable', async () => {
    const local = memoryKeyValueStore();
    const first = await ensureTableIdentity(tableKeyStore(local), crypto);
    expect(first.id).toBe(await crypto.keyId(first.keys.publicKey));
    expect(local.get(TABLE_KEY_STORAGE)).toEqual({ id: first.id, publicKey: first.keys.publicKey, privateKey: first.keys.privateKey });
    expect(await ensureTableIdentity(tableKeyStore(local), crypto)).toEqual(first);
  });

  it('replaces a broken stored key', async () => {
    const local = memoryKeyValueStore();
    local.set(TABLE_KEY_STORAGE, { id: 'short', publicKey: 'x', privateKey: {} });
    const made = await ensureTableIdentity(tableKeyStore(local), crypto);
    expect(tableKeyStore(local).get()?.id).toBe(made.id);
  });

  it('moves this device\'s key into local storage, then strips it from the old settings file and the plugin data, keeping every other setting', async () => {
    const own = await tableOf();
    const { app, files, plugin, keys } = device(own);
    await moveTableKeyOnStart(app, keys, plugin);
    expect(keys.get()).toEqual(own);
    expect(JSON.parse(files.get(OLD)!)).toEqual({ diceColour: 'dark', online: { playerName: 'Guy', keepImages: false } });
    expect(plugin.stored()).toEqual({ diceColour: 'dark', online: { playerName: 'Guy' } });
    // The same table hosts on: its id is unchanged.
    expect((await ensureTableIdentity(keys, crypto)).id).toBe(own.id);
  });

  it('keeps the key this device holds already: the local one wins', async () => {
    const kept = await tableOf();
    const { app, files, plugin, keys } = device(await tableOf());
    keys.set(kept);
    await moveTableKeyOnStart(app, keys, plugin);
    expect(keys.get()).toEqual(kept);
    expect(files.get(OLD)).not.toContain('privateKey');
  });

  it('lets a second device, with the synced settings but no key of its own, host a table of its own, as before 0.6', async () => {
    const first = await tableOf();
    const { app, plugin, keys } = device(null, { online: { table: first } });
    await moveTableKeyOnStart(app, keys, plugin);
    expect(keys.get()).toBeNull();
    expect(JSON.stringify(plugin.stored())).not.toContain('privateKey');
    const own = await ensureTableIdentity(keys, crypto);
    expect(own.id).not.toBe(first.id);
  });

  it('loses nothing when the device cannot keep the key: the files stay whole until a later start', async () => {
    const own = await tableOf();
    const { app, files, plugin, local } = device(own);
    const before = files.get(OLD);
    const broken = { get: (): unknown => null, set: (): void => {} };
    expect(moveTableKeyToDevice(tableKeyStore(broken), own)).toBe(false);
    await moveTableKeyOnStart(app, tableKeyStore(broken), plugin);
    expect(files.get(OLD)).toBe(before);
    // The next start, with working storage, moves it and only then strips the file.
    await moveTableKeyOnStart(app, tableKeyStore(local), plugin);
    expect(tableKeyStore(local).get()).toEqual(own);
    expect(files.get(OLD)).not.toContain('privateKey');
  });

  it('only logs when an old file cannot be rewritten, the local copy being safe', async () => {
    const own = await tableOf();
    const { app, plugin, keys } = device(own);
    vi.spyOn(app.vault.adapter, 'write').mockRejectedValue(new Error('read-only'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(moveTableKeyOnStart(app, keys, plugin)).resolves.toBeUndefined();
    expect(keys.get()).toEqual(own);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('reads this device\'s key from its old settings file', async () => {
    const own = await tableOf();
    expect(await ownOldTableKey(device(own).app)).toEqual(own);
    expect(await ownOldTableKey(createInMemoryApp().app)).toBeNull();
  });

  it('keeps the plugin data free of the key: the migration\'s first save and every read', async () => {
    const own = await tableOf();
    const plugin = memoryPluginData({ online: { playerName: 'Guy', table: own } });
    const data = withoutSyncedTableKey(plugin);
    expect(JSON.stringify(await data.loadData())).not.toContain('privateKey');
    await data.saveData({ diceColour: 'dark', online: { playerName: 'Guy', table: own } });
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(plugin.saveData).mock.calls[0]![0])).not.toContain('privateKey');
    expect(plugin.stored()).toEqual({ diceColour: 'dark', online: { playerName: 'Guy' } });
  });
});
