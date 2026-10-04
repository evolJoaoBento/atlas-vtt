import type { App } from 'obsidian';
import type AtlasVTTPlugin from '../../main';
import type { ApiServices } from '../../src/api/services';
import type { ConnectingPlugin } from '../../src/api/types/api';

export interface FakePlugin extends ConnectingPlugin {
  /** Runs what `register` was given, as Obsidian does when a plugin unloads. */
  unload(): void;
}

export function fakePlugin(id: string): FakePlugin {
  const cleanups: Array<() => void> = [];
  return {
    manifest: { id, name: id, version: '1.0.0', minAppVersion: '1.8.7', author: 'test', description: '' },
    register: (cleanup: () => void): void => { cleanups.push(cleanup); },
    unload: (): void => { for (const cleanup of cleanups.splice(0)) cleanup(); },
  } as FakePlugin;
}

export interface FakeWorkspaceApp { app: App; triggered: Array<{ name: string; data: unknown[] }> }

export function fakeApp(): FakeWorkspaceApp {
  const triggered: Array<{ name: string; data: unknown[] }> = [];
  const app = { workspace: { trigger: (name: string, ...data: unknown[]): void => { triggered.push({ name, data }); } } } as unknown as App;
  return { app, triggered };
}

/** The services every facade is built with; later groups add their fields here as they land. */
export function fakeServices(app: App): ApiServices {
  return { app, plugin: {} as unknown as AtlasVTTPlugin };
}
