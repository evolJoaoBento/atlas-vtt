import { describe, expect, it, vi } from 'vitest';

const initialize = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock('../../src/app/services/AssetService', () => ({
  AssetService: { getInstance: (): { initialize: () => Promise<void> } => ({ initialize }) },
}));

import type AtlasVTTPlugin from '../../main';
import { ExtensionApiPublisher } from '../../src/api/ExtensionApiPublisher';
import { fakeApp, fakePlugin } from './apiFakes';

function atlas(): { plugin: AtlasVTTPlugin; triggered: ReturnType<typeof fakeApp>['triggered'] } {
  const { app, triggered } = fakeApp();
  return { plugin: { app, api: undefined } as unknown as AtlasVTTPlugin, triggered };
}

describe('ExtensionApiPublisher', () => {
  it('sets plugin.api only once the asset index is ready, then announces it', async () => {
    let finish: () => void = () => undefined;
    initialize.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const { plugin, triggered } = atlas();
    const publisher = new ExtensionApiPublisher(plugin);
    const started = publisher.start();
    expect(plugin.api).toBeUndefined();
    expect(triggered).toEqual([]);
    finish();
    await started;
    expect(plugin.api).toBeDefined();
    expect(triggered).toEqual([{ name: 'atlas-vtt:api-ready', data: [plugin.api] }]);
  });

  it('publishes nothing when Atlas unloads before the index is ready', async () => {
    let finish: () => void = () => undefined;
    initialize.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const { plugin, triggered } = atlas();
    const publisher = new ExtensionApiPublisher(plugin);
    const started = publisher.start();
    publisher.stop();
    finish();
    await started;
    expect(plugin.api).toBeUndefined();
    expect(triggered).toEqual([]);
  });

  it('on stop tells connected extensions, clears plugin.api and triggers api-unload', async () => {
    initialize.mockResolvedValue(undefined);
    const { plugin, triggered } = atlas();
    const publisher = new ExtensionApiPublisher(plugin);
    await publisher.start();
    const listener = vi.fn();
    plugin.api?.connect(fakePlugin('ext')).on('unload', listener);
    publisher.stop();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(plugin.api).toBeUndefined();
    expect(triggered.at(-1)).toEqual({ name: 'atlas-vtt:api-unload', data: [] });
  });
});
