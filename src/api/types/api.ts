import type { Plugin } from 'obsidian';
import type { AtlasCapability, Disposer, ViewId } from './common';
import type { DiceApi } from './dice';
import type { LasersApi } from './lasers';
import type { LightingApi } from './lighting';
import type { PresentationApi } from './presentation';
import type { RemoteViewsApi } from './remoteViews';
import type { RulesApi } from './rules';
import type { BundlesApi, ScenesApi } from './scenes';
import type { AtlasSettingKey, SettingsApi, StorageApi } from './settings';
import type { TokensApi } from './tokens';
import type { UiApi } from './ui';
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
  /** Scene records were added, removed, renamed, moved to another collection or pointed at another map. Read `scenes.list` again. */
  'scenes-changed': () => void;
}

export interface AtlasExtension {
  /** The calling plugin's manifest id. */
  readonly id: string;
  readonly views: ViewsApi;
  readonly presentation: PresentationApi;
  readonly dice: DiceApi;
  readonly lasers: LasersApi;
  readonly lighting: LightingApi;
  readonly tokens: TokensApi;
  readonly rules: RulesApi;
  readonly settings: SettingsApi;
  readonly storage: StorageApi;
  readonly ui: UiApi;
  readonly scenes: ScenesApi;
  readonly bundles: BundlesApi;
  /** Only when `has('remote-view')`. */
  readonly remoteViews?: RemoteViewsApi;
  on<E extends keyof AtlasEvents>(event: E, listener: AtlasEvents[E]): Disposer;
}
