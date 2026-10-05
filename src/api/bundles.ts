import { bundleNoteKeys } from '../app/extensions/bundleNoteKeys';
import type { ExtensionScope } from './extension';
import type { Disposer } from './types/common';
import type { BundlesApi } from './types/scenes';

export function bundlesApi(scope: Pick<ExtensionScope, 'id' | 'disposers'>): BundlesApi {
  return Object.freeze({
    stripNoteProperties: (keys: readonly string[]): Disposer => {
      if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string' || !key.trim())) {
        throw new Error('[Atlas API] stripNoteProperties needs an array of non-empty property names.');
      }
      // Unloading the extension ends only the live registration; Atlas keeps the keys until the returned disposer is called.
      const stopLive = scope.disposers.add(bundleNoteKeys.add(scope.id, keys));
      bundleNoteKeys.remember(scope.id, keys);
      return (): void => {
        stopLive();
        bundleNoteKeys.forget(scope.id, keys);
      };
    },
  });
}
