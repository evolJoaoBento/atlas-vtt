import { diceApi } from './dice';
import type { DisposerSet } from './disposers';
import type { ApiEvents } from './events';
import type { ApiServices } from './services';
import { lasersApi } from './lasers';
import { lightingApi } from './lighting';
import { presentationApi } from './presentation';
import { remoteViewsApi } from './remoteViews';
import { bundlesApi } from './bundles';
import { rulesApi } from './rules';
import { scenesApi } from './scenes';
import { settingsApi } from './settings';
import { storageApi } from './storage';
import { tokensApi } from './tokens';
import { uiApi } from './ui';
import { viewsApi } from './views';
import type { AtlasEvents, AtlasExtension } from './types/api';
import type { AtlasCapability, Disposer } from './types/common';

export interface ExtensionScope {
  readonly id: string;
  readonly disposers: DisposerSet;
  readonly events: ApiEvents;
  /** What `has()` answers true for; an optional namespace is set only when its capability is here. */
  readonly capabilities: ReadonlySet<AtlasCapability>;
}

/** One connected extension's view of the API: one line per namespace, each registration owned by `scope`. */
export function buildExtension(scope: ExtensionScope, services: ApiServices): AtlasExtension {
  function on<E extends keyof AtlasEvents>(event: E, listener: AtlasEvents[E]): Disposer {
    return scope.disposers.add(scope.events.on(event, listener));
  }
  return Object.freeze({ id: scope.id, on, views: viewsApi(services.views, scope.disposers),
    presentation: presentationApi(services.views, scope.disposers, scope.id), dice: diceApi(services.app, scope.disposers),
    lasers: lasersApi(services.views, scope.disposers), lighting: lightingApi(services.views, services.sightFrames, scope.disposers),
    tokens: tokensApi(services.views), rules: rulesApi(services.app),
    settings: settingsApi(services.settings), storage: storageApi(services.app, scope.id),
    ui: uiApi(scope, services.views), scenes: scenesApi(services.app, scope), bundles: bundlesApi(scope),
    ...(scope.capabilities.has('remote-view') ? { remoteViews: remoteViewsApi(services.app, scope, services.views) } : {}) });
}
