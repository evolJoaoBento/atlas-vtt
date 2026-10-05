import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateSettingsToPluginData } from '../../../src/app/plugin/settingsMigration';
import { memoryKeyValueStore } from '../../../src/app/online/sharing/identity/deviceKeys';
import { moveTableKeyOnStart, tableKeyStore, withoutSyncedTableKey } from '../../../src/app/online/sharing/identity/tableKey';
import { SettingsService } from '../../../src/app/services/SettingsService';
import { SystemPresetFiles } from '../../../src/app/services/systemPresets/SystemPresetFiles';
import type { App } from 'obsidian';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { memoryPluginData } from '../../mocks/pluginData';

/** Where Atlas 0.5 kept its settings, online play's among them. */
const HIDDEN_SETTINGS = 'atlas-vtt/.atlas-data/settings.json';

const TABLE = {
  id: 'A'.repeat(43),
  publicKey: 'BPublicKey',
  privateKey: { kty: 'EC', crv: 'P-256', d: 'secret', x: 'x', y: 'y' },
};
const ONLINE = {
  signaling: { mode: 'custom', host: 'peer.example.org', port: 9000, path: '/peer', key: 'table', secure: true },
  turnServers: [{ urls: 'turn:turn.example.org', username: 'gm', credential: 'pw' }],
  playerPageUrl: 'https://example.org/join/',
  logEvents: true,
  playerName: 'Guy',
  keepImages: false,
  table: TABLE,
  shareableProperties: ['tags'],
};

const opened: App[] = [];

afterEach(() => {
  for (const app of opened.splice(0)) SystemPresetFiles.release(app);
  vi.useRealTimers();
});

describe('online settings in the plugin data (upstream 0.6 moved the settings there)', () => {
  it('carries the online settings over from the old settings file, and the table key to this device only, as main.ts wires it', async () => {
    vi.useFakeTimers();
    const vault = createInMemoryApp({ files: { [HIDDEN_SETTINGS]: JSON.stringify({ diceColour: 'dark', online: ONLINE }) } });
    opened.push(vault.app);
    const data = memoryPluginData(null);
    await migrateSettingsToPluginData(vault.app, withoutSyncedTableKey(data), SystemPresetFiles.open(vault.app));
    // The migration's first save already holds no private key.
    expect(data.saveData).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(data.saveData).mock.calls[0]![0])).not.toContain('secret');

    const settings = new SettingsService(vault.app, undefined, withoutSyncedTableKey(data));
    await settings.initialize();
    const local = memoryKeyValueStore();
    await moveTableKeyOnStart(vault.app, tableKeyStore(local), data);
    await vi.advanceTimersByTimeAsync(1000);

    const { table: _table, ...settingsWithoutKey } = ONLINE;
    expect(settings.getOnlineSettings()).toEqual(settingsWithoutKey);
    expect(tableKeyStore(local).get()).toEqual(TABLE);
    expect(JSON.stringify(data.stored())).not.toContain('secret');
    expect(vault.files.get(HIDDEN_SETTINGS)).not.toContain('secret');
    expect((data.stored() as { online?: { playerName?: string } }).online?.playerName).toBe('Guy');
  });

  it('never takes in a table key another device left in the plugin data, on start or on a reload', async () => {
    vi.useFakeTimers();
    const vault = createInMemoryApp();
    const data = memoryPluginData({ online: { playerName: 'Guy' } });
    const settings = new SettingsService(vault.app, undefined, withoutSyncedTableKey(data));
    await settings.initialize();
    // A sync delivers plugin data with a key in it; the next save of this device must not carry it on.
    data.set({ online: { playerName: 'Ana', table: TABLE } });
    await settings.reload();
    expect(settings.getOnlineSettings().playerName).toBe('Ana');
    settings.setOnlineSettings({ keepImages: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(JSON.stringify(data.stored())).not.toContain('secret');
    expect((data.stored() as { online?: unknown }).online).toMatchObject({ playerName: 'Ana', keepImages: false });
  });

  it('saves a change of the online settings into the plugin data and reads it back', async () => {
    vi.useFakeTimers();
    const vault = createInMemoryApp();
    const data = memoryPluginData({});
    const settings = new SettingsService(vault.app, undefined, withoutSyncedTableKey(data));
    await settings.initialize();
    settings.setOnlineSettings({ playerName: 'Guy' });
    await vi.advanceTimersByTimeAsync(1000);
    expect((data.stored() as { online?: unknown }).online).toMatchObject({ playerName: 'Guy' });

    const again = new SettingsService(vault.app, undefined, withoutSyncedTableKey(data));
    await again.initialize();
    expect(again.getOnlineSettings()).toMatchObject({ playerName: 'Guy', keepImages: true });
  });
});
