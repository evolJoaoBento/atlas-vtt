import { diceApi } from './dice';
import type { DisposerSet } from './disposers';
import type { ApiEvents } from './events';
import type { ApiServices } from './services';
import { lasersApi } from './lasers';
import { presentationApi } from './presentation';
import { rulesApi } from './rules';
import { settingsApi } from './settings';
import { storageApi } from './storage';
import { viewsApi } from './views';
import type { AtlasEvents, AtlasExtension } from './types/api';
import type { Disposer } from './types/common';

export interface ExtensionScope {
  readonly id: string;
  readonly disposers: DisposerSet;
  readonly events: ApiEvents;
}

/** One connected extension's view of the API: one line per namespace, each registration owned by `scope`. */
export function buildExtension(scope: ExtensionScope, services: ApiServices): AtlasExtension {
  function on<E extends keyof AtlasEvents>(event: E, listener: AtlasEvents[E]): Disposer {
    return scope.disposers.add(scope.events.on(event, listener));
  }
  return Object.freeze({ id: scope.id, on, views: viewsApi(services.views, scope.disposers),
    presentation: presentationApi(services.views, scope.disposers), dice: diceApi(services.app, scope.disposers),
    lasers: lasersApi(services.views, scope.disposers),
    rules: rulesApi(services.app),
    settings: settingsApi(services.settings), storage: storageApi(services.app, scope.id) });
}
