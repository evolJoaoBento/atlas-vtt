import { describe, expect, it, vi } from 'vitest';
import { ApiEvents } from '../../src/api/events';
import { PLAYER_VIEW_RULE_KEYS, settingsApi, settingsView, watchSettings } from '../../src/api/settings';
import { storageApi } from '../../src/api/storage';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

async function loadedService(): Promise<SettingsService> {
  const service = new SettingsService(createInMemoryApp().app, Promise.resolve());
  await service.initialize();
  return service;
}

describe('settings', () => {
  it('C-settings-1: playerView has exactly the four rules; settings-changed fires only for a key whose value changed', async () => {
    const service = await loadedService();
    const view = settingsView(service);
    expect(Object.keys(view.playerView).sort()).toEqual(['showGrid', 'showInitiative', 'showTokenNameplates', 'showWidgets']);
    expect(Object.keys(view.playerView).sort()).toEqual([...PLAYER_VIEW_RULE_KEYS].sort());
    expect(settingsApi(service).get('diceDisplay')).toBe(service.getDiceDisplay());
    const changed = vi.fn();
    const events = new ApiEvents();
    events.on('settings-changed', changed);
    const stop = watchSettings(service, events);
    service.setLaserPointerSettings({ color: '#ff0000' });
    expect(changed.mock.calls).toEqual([['laserPointer']]);
    service.setLaserPointerSettings({ color: '#ff0000' });
    expect(changed).toHaveBeenCalledTimes(1);
    stop();
    service.setLaserPointerSettings({ color: '#00ff00' });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('C-settings-2: a player view switch or the dice look reports its own key; a rule outside the four reports nothing', async () => {
    const service = await loadedService();
    const changed = vi.fn();
    const events = new ApiEvents();
    events.on('settings-changed', changed);
    watchSettings(service, events);
    service.setLocalPlayerViewSettings({ showGrid: !service.getLocalPlayerViewSettings().showGrid });
    service.setDiceDisplay('card');
    service.setLocalPlayerViewSettings({ showToolbar: !service.getLocalPlayerViewSettings().showToolbar });
    expect(changed.mock.calls).toEqual([['playerView'], ['diceDisplay']]);
  });
});

describe('storage', () => {
  it("C-storage-1: folder() is the extension's dot folder, created on first call and idempotent", async () => {
    const { app } = createInMemoryApp();
    const storage = storageApi(app, 'atlas-vtt-connect');
    expect(await storage.folder()).toBe('atlas-vtt/.atlas-data/extensions/atlas-vtt-connect');
    expect(await app.vault.adapter.exists('atlas-vtt/.atlas-data/extensions/atlas-vtt-connect')).toBe(true);
    expect(await storage.folder()).toBe('atlas-vtt/.atlas-data/extensions/atlas-vtt-connect');
  });

  it('C-storage-2: an id outside kebab-case rejects in folder(), not when the storage is built', async () => {
    const { app } = createInMemoryApp();
    for (const id of ['My_Plugin', 'a.b', '../x', 'a/b', '']) {
      const storage = storageApi(app, id);
      await expect(storage.folder()).rejects.toThrow('kebab-case');
    }
    expect(await app.vault.adapter.exists('atlas-vtt/.atlas-data/extensions/My_Plugin')).toBe(false);
  });

  it('C-storage-3: a failed creation is tried again on the next call', async () => {
    const { app } = createInMemoryApp();
    const mkdir = vi.spyOn(app.vault.adapter, 'mkdir').mockRejectedValueOnce(new Error('disk full'));
    const storage = storageApi(app, 'ext');
    await expect(storage.folder()).rejects.toThrow('disk full');
    mkdir.mockRestore();
    expect(await storage.folder()).toBe('atlas-vtt/.atlas-data/extensions/ext');
  });
});
