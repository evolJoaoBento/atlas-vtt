import type { App } from 'obsidian';
import { DisposerSet } from './disposers';
import { ApiEvents } from './events';
import type { ExtensionScope } from './extension';
import type { AtlasApi, AtlasExtension, ConnectingPlugin } from './types/api';
import type { AtlasCapability } from './types/common';
import { API_VERSION } from './version';

export interface ApiHostOptions {
  app: App;
  capabilities: readonly AtlasCapability[];
  build(scope: ExtensionScope): AtlasExtension;
}

/** The published API object and every connected extension's registrations. */
export class AtlasApiHost {
  readonly api: AtlasApi;
  private readonly events = new ApiEvents();
  private readonly connected = new Map<string, DisposerSet>();
  private disposed = false;

  constructor(private readonly options: ApiHostOptions) {
    const capabilities = new Set<string>(options.capabilities);
    this.api = Object.freeze({
      version: API_VERSION,
      has: (capability: AtlasCapability): boolean => capabilities.has(capability),
      connect: (plugin: ConnectingPlugin): AtlasExtension => this.connect(plugin),
    });
  }

  /** The events every facade emits through. */
  get apiEvents(): ApiEvents {
    return this.events;
  }

  publish(): void {
    if (this.disposed) return;
    this.options.app.workspace.trigger('atlas-vtt:api-ready', this.api);
  }

  /** Atlas is unloading: tell every extension, dispose all their registrations, then say so on the workspace. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.emit('unload');
    for (const disposers of this.connected.values()) disposers.disposeAll();
    this.connected.clear();
    this.options.app.workspace.trigger('atlas-vtt:api-unload');
  }

  listenerCount(): number {
    return this.events.size;
  }

  private connect(plugin: ConnectingPlugin): AtlasExtension {
    if (this.disposed) throw new Error('Atlas VTT has unloaded; wait for atlas-vtt:api-ready.');
    const id = plugin.manifest.id;
    this.connected.get(id)?.disposeAll();
    const disposers = new DisposerSet();
    this.connected.set(id, disposers);
    plugin.register(() => {
      disposers.disposeAll();
      if (this.connected.get(id) === disposers) this.connected.delete(id);
    });
    return this.options.build({ id, disposers, events: this.events });
  }
}
