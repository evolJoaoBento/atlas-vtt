import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnlineSessionService } from '../../../../src/app/online/OnlineSessionService';
import { onlineSessionStore, resetOnlineSessionStore } from '../../../../src/app/online/onlineSessionStore';
import { DEFAULT_ONLINE_SETTINGS, type OnlineSettings, type StoredTable } from '../../../../src/app/online/onlineSettings';
import { memoryKeyValueStore } from '../../../../src/app/online/sharing/identity/deviceKeys';
import { renewTableIdentity, TABLE_KEY_STORAGE, tableKeyStore } from '../../../../src/app/online/sharing/identity/tableKey';
import { MemoryNetwork } from '../../../../src/app/online/transport/MemoryTransport';
import { confirmNewTableKey } from '../../../../src/app/online/ui/newTableKey';
import { onlineSettingsSection } from '../../../../src/app/settings/onlineSettingsSection';
import { nodeIdentityCrypto as crypto } from './sharingFixtures';

const app = { workspace: { on: () => ({}), offref: () => {} }, vault: { getName: () => 'My Vault', getAbstractFileByPath: () => null, on: () => ({}), offref: () => {} } } as never;

afterEach(() => { resetOnlineSessionStore(); });

async function tableOf(): Promise<StoredTable> {
  const keys = await crypto.generate();
  return { id: await crypto.keyId(keys.publicKey), publicKey: keys.publicKey, privateKey: keys.privateKey };
}

/** Synced settings that still hold a leaked table key, as Atlas 0.6's settings migration left them. */
function syncedSettings(table: StoredTable | null) {
  let online: OnlineSettings = { ...DEFAULT_ONLINE_SETTINGS, table };
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

  it('stops hosting first, hosts the new table next time and leaves no key in the synced settings', async () => {
    const leaked = await tableOf();
    const settings = syncedSettings(leaked);
    const local = memoryKeyValueStore();
    const keys = tableKeyStore(local);
    keys.set(leaked);
    const network = new MemoryNetwork();
    let hosts = 0;
    const svc = new OnlineSessionService(app, settings as never, {
      tableKeys: keys, identityCrypto: crypto, createHost: async () => network.host(`gm-${++hosts}`), showRequest: () => ({ hide: () => {} }),
    });
    await svc.start();
    expect(onlineSessionStore.getState().error).toBeNull();
    expect(onlineSessionStore.getState().status).toBe('hosting');
    expect(svc.table?.id).toBe(leaked.id);

    const id = await svc.renewTableKey();
    expect(onlineSessionStore.getState().status).toBe('idle');
    expect(id).not.toBe(leaked.id);
    expect(keys.get()?.id).toBe(id);
    expect(settings.getOnlineSettings().table).toBeNull();

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
    const rows = onlineSettingsSection(syncedSettings(null) as never, newTableKey).rows;
    expect(rows.some((row) => row.name === 'New table key')).toBe(true);
    expect(onlineSettingsSection(syncedSettings(null) as never).rows.some((row) => row.name === 'New table key')).toBe(false);
  });
});
