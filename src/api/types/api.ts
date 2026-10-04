import type { Plugin } from 'obsidian';
import type { AtlasCapability, Disposer } from './common';

/** What `connect` needs of the calling plugin: its id, and where to register its own teardown. */
export type ConnectingPlugin = Pick<Plugin, 'manifest' | 'register'>;

/** `app.plugins.plugins['atlas-vtt'].api`, set once Atlas's storage and asset index are ready. */
export interface AtlasApi {
  /** Semver of this API, e.g. "1.0.0"; independent of Atlas's own version. */
  readonly version: string;
  has(capability: AtlasCapability): boolean;
  /** Scopes everything to `plugin.manifest.id`; registrations are disposed when either plugin unloads. */
  connect(plugin: ConnectingPlugin): AtlasExtension;
}

export interface AtlasEvents {
  /** Atlas is unloading; everything is disposed after this. */
  unload: () => void;
}

export interface AtlasExtension {
  /** The calling plugin's manifest id. */
  readonly id: string;
  on<E extends keyof AtlasEvents>(event: E, listener: AtlasEvents[E]): Disposer;
}
