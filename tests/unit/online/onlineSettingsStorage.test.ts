import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateSettingsToPluginData } from '../../../src/app/plugin/settingsMigration';
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
  it('carries the online settings over from the old settings file, the table key included', async () => {
    const vault = createInMemoryApp({ files: { [HIDDEN_SETTINGS]: JSON.stringify({ diceColour: 'dark', online: ONLINE }) } });
    opened.push(vault.app);
    const data = memoryPluginData(null);
    await migrateSettingsToPluginData(vault.app, data, SystemPresetFiles.open(vault.app));

    const settings = new SettingsService(vault.app, undefined, data);
    await settings.initialize();
    expect(settings.getOnlineSettings()).toEqual(ONLINE);
  });

  it('saves a change of the online settings into the plugin data and reads it back', async () => {
    vi.useFakeTimers();
    const vault = createInMemoryApp();
    const data = memoryPluginData({});
    const settings = new SettingsService(vault.app, undefined, data);
    await settings.initialize();
    expect(settings.getOnlineSettings().table).toBeNull();

    settings.setOnlineSettings({ table: TABLE, playerName: 'Guy' });
    await vi.advanceTimersByTimeAsync(1000);
    expect((data.stored() as { online?: unknown }).online).toMatchObject({ table: TABLE, playerName: 'Guy' });

    const again = new SettingsService(vault.app, undefined, data);
    await again.initialize();
    expect(again.getOnlineSettings()).toMatchObject({ table: TABLE, playerName: 'Guy', keepImages: true });
  });
});
