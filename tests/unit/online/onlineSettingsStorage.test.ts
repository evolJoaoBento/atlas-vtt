import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateSettingsToPluginData } from '../../../src/app/plugin/settingsMigration';
import { memoryKeyValueStore } from '../../../src/app/online/sharing/identity/deviceKeys';
import { moveTableKeyToDevice, ownOldTableKey, tableKeyStore } from '../../../src/app/online/sharing/identity/tableKey';
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
  it('carries the online settings over from the old settings file, and the table key to this device only', async () => {
    vi.useFakeTimers();
    const vault = createInMemoryApp({ files: { [HIDDEN_SETTINGS]: JSON.stringify({ diceColour: 'dark', online: ONLINE }) } });
    opened.push(vault.app);
    const data = memoryPluginData(null);
    await migrateSettingsToPluginData(vault.app, data, SystemPresetFiles.open(vault.app));

    // As the plugin starts: the settings load, then the table key leaves them.
    const settings = new SettingsService(vault.app, undefined, data);
    await settings.initialize();
    const local = memoryKeyValueStore();
    moveTableKeyToDevice(settings, tableKeyStore(local), await ownOldTableKey(vault.app));
    await vi.advanceTimersByTimeAsync(1000);

    expect(settings.getOnlineSettings()).toEqual({ ...ONLINE, table: null });
    expect(tableKeyStore(local).get()).toEqual(TABLE);
    // No private key in the synced file.
    expect(JSON.stringify(data.stored())).not.toContain('secret');
    expect((data.stored() as { online?: { playerName?: string } }).online?.playerName).toBe('Guy');
  });

  it('saves a change of the online settings into the plugin data and reads it back', async () => {
    vi.useFakeTimers();
    const vault = createInMemoryApp();
    const data = memoryPluginData({});
    const settings = new SettingsService(vault.app, undefined, data);
    await settings.initialize();
    expect(settings.getOnlineSettings().table).toBeNull();

    settings.setOnlineSettings({ playerName: 'Guy' });
    await vi.advanceTimersByTimeAsync(1000);
    expect((data.stored() as { online?: unknown }).online).toMatchObject({ table: null, playerName: 'Guy' });

    const again = new SettingsService(vault.app, undefined, data);
    await again.initialize();
    expect(again.getOnlineSettings()).toMatchObject({ table: null, playerName: 'Guy', keepImages: true });
  });
});
