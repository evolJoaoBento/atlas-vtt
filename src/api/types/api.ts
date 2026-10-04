import type { Plugin } from 'obsidian';
import type { AtlasCapability, Disposer, ViewId } from './common';
import type { PresentationApi } from './presentation';
import type { RulesApi } from './rules';
import type { AtlasSettingKey, SettingsApi, StorageApi } from './settings';
import type { ViewInfo, ViewsApi } from './views';

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
  /** A view's store holds a map, loaded and drawn; fires once per map load. */
  'map-loaded': (view: ViewInfo) => void;
  /** The view closed; its id is never reused. */
  'map-closed': (viewId: ViewId) => void;
  /** A collection's rules changed (its id), or the asset index finished loading (null: any may have). Read `rules.forMap` again. */
  'rules-changed': (collectionId: string | null) => void;
  /** A setting's value changed; read it again with `settings.get`. */
  'settings-changed': (key: AtlasSettingKey) => void;
}

export interface AtlasExtension {
  /** The calling plugin's manifest id. */
  readonly id: string;
  readonly views: ViewsApi;
  readonly presentation: PresentationApi;
  readonly rules: RulesApi;
  readonly settings: SettingsApi;
  readonly storage: StorageApi;
  on<E extends keyof AtlasEvents>(event: E, listener: AtlasEvents[E]): Disposer;
}
