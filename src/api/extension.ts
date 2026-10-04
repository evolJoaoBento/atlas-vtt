import type { DisposerSet } from './disposers';
import type { ApiEvents } from './events';
import type { ApiServices } from './services';
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
  void services;
  return Object.freeze({ id: scope.id, on });
}
