import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnlineSessionService } from '../../../../src/app/online/OnlineSessionService';
import { onlineSessionStore, resetOnlineSessionStore } from '../../../../src/app/online/onlineSessionStore';
import { DEFAULT_ONLINE_SETTINGS, type OnlineSettings, type StoredTable } from '../../../../src/app/online/onlineSettings';
import { memoryKeyValueStore } from '../../../../src/app/online/sharing/identity/deviceKeys';
import { moveTableKeyOnStart, renewTableIdentity, TABLE_KEY_STORAGE, tableKeyStore } from '../../../../src/app/online/sharing/identity/tableKey';
import { MemoryNetwork } from '../../../../src/app/online/transport/MemoryTransport';
import { confirmNewTableKey } from '../../../../src/app/online/ui/newTableKey';
import { onlineSettingsSection } from '../../../../src/app/settings/onlineSettingsSection';
import { nodeIdentityCrypto as crypto } from './sharingFixtures';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { memoryPluginData } from '../../../mocks/pluginData';

const OLD = 'atlas-vtt/.atlas-data/settings.json';

const app = { workspace: { on: () => ({}), offref: () => {} }, vault: { getName: () => 'My Vault', getAbstractFileByPath: () => null, on: () => ({}), offref: () => {} } } as never;

afterEach(() => { resetOnlineSessionStore(); });

async function tableOf(): Promise<StoredTable> {
  const keys = await crypto.generate();
  return { id: await crypto.keyId(keys.publicKey), publicKey: keys.publicKey, privateKey: keys.privateKey };
}

/** The online settings as the session service reads them. */
function syncedSettings() {
  let online: OnlineSettings = { ...DEFAULT_ONLINE_SETTINGS };
  return {
    getOnlineSettings: () => online,
    setOnlineSettings: (partial: Partial<OnlineSettings>) => { online = { ...online, ...partial }; },
    getLocalPlayerViewSettings: () => ({ showGrid: true, showTokenNameplates: false, showWidgets: true, showInitiative: true }),
    onChange: () => () => {},
  };
}

describe('the table key in local storage', () => {
  it('is kept under the name Atlas VTT Connect adopts: atlas-online-table-key', async () => {
    expect(TABLE_KEY_STORAGE).toBe('atlas-online-table-key');
    const local = memoryKeyValueStore();
    const table = await tableOf();
    tableKeyStore(local).set(table);
    expect(local.get('atlas-online-table-key')).toEqual(table);
  });
});

describe('New table key', () => {
  it('makes a new key pair, kept on the device only, and keeps the old one when the new one cannot be kept', async () => {
    const local = memoryKeyValueStore();
    const old = await tableOf();
    tableKeyStore(local).set(old);
    const renewed = await renewTableIdentity(tableKeyStore(local), crypto);
    expect(renewed.id).not.toBe(old.id);
    expect(tableKeyStore(local).get()?.id).toBe(renewed.id);

    const stuck = { get: () => old, set: () => false };
    await expect(renewTableIdentity(stuck, crypto)).rejects.toThrow();
  });

  it('stops hosting first, hosts the new table next time and leaves the old key in no vault file', async () => {
    const leaked = await tableOf();
    const settings = syncedSettings();
    const local = memoryKeyValueStore();
    const keys = tableKeyStore(local);
    keys.set(leaked);
    // Copies of the old key that reached the vault: the old settings file and Atlas 0.6's synced plugin data.
    const vault = createInMemoryApp({ files: { [OLD]: JSON.stringify({ diceColour: 'dark', online: { playerName: 'Guy', table: leaked } }) } });
    const plugin = memoryPluginData({ online: { playerName: 'Guy', table: leaked } });
    // What the session service reads of the app besides the vault's files.
    Object.assign(vault.app.vault, { getName: () => 'My Vault' });
    const svcApp = Object.assign(vault.app, { workspace: { ...vault.app.workspace, on: () => ({}), offref: () => {} } });
    const network = new MemoryNetwork();
    let hosts = 0;
    const svc = new OnlineSessionService(svcApp, settings as never, {
      tableKeys: keys, pluginData: plugin, identityCrypto: crypto, createHost: async () => network.host(`gm-${++hosts}`), showRequest: () => ({ hide: () => {} }),
    });
    await svc.start();
    expect(onlineSessionStore.getState().error).toBeNull();
    expect(onlineSessionStore.getState().status).toBe('hosting');
    expect(svc.table?.id).toBe(leaked.id);

    const id = await svc.renewTableKey();
    expect(onlineSessionStore.getState().status).toBe('idle');
    expect(id).not.toBe(leaked.id);
    expect(keys.get()?.id).toBe(id);
    expect(vault.files.get(OLD)).not.toContain(leaked.publicKey);
    expect(JSON.parse(vault.files.get(OLD)!)).toEqual({ diceColour: 'dark', online: { playerName: 'Guy' } });
    expect(JSON.stringify(plugin.stored())).not.toContain(leaked.publicKey);

    // A device of the same vault whose local storage is empty (reinstalled, restored, a second device)
    // does not get the old key back at its next start: it makes a table of its own.
    const emptyDevice = tableKeyStore(memoryKeyValueStore());
    await moveTableKeyOnStart(vault.app, emptyDevice, plugin);
    expect(emptyDevice.get()).toBeNull();

    await svc.start();
    expect(svc.table?.id).toBe(id);
    svc.stop();
  });

  it('asks first, says every player must be let in again and that hosting stops, and does nothing when cancelled', async () => {
    const renewTableKey = vi.fn(async () => 'new-id');
    const cancel = vi.fn(async () => false);
    expect(await confirmNewTableKey({ renewTableKey }, cancel)).toBe(false);
    expect(renewTableKey).not.toHaveBeenCalled();
    expect(cancel.mock.calls[0]![0].message.join(' ')).toContain('every player must be let in again');
    expect(cancel.mock.calls[0]![0].message.join(' ')).not.toContain('stops first');

    onlineSessionStore.setState({ status: 'hosting' });
    const confirm = vi.fn(async () => true);
    expect(await confirmNewTableKey({ renewTableKey }, confirm)).toBe(true);
    expect(renewTableKey).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toMatchObject({ destructive: true });
    expect(confirm.mock.calls[0]![0].message.join(' ')).toContain('stops first');
  });

  it('reports a key that could not be made, and is a button in the online settings', async () => {
    const failing = { renewTableKey: vi.fn(async () => { throw new Error('storage blocked'); }) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await confirmNewTableKey(failing, async () => true)).toBe(false);
    error.mockRestore();

    const newTableKey = vi.fn();
    const rows = onlineSettingsSection(syncedSettings() as never, newTableKey).rows;
    expect(rows.some((row) => row.name === 'New table key')).toBe(true);
    expect(onlineSettingsSection(syncedSettings() as never).rows.some((row) => row.name === 'New table key')).toBe(false);
  });
});
