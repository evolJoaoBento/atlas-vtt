import type { App } from 'obsidian';
import { ensureAdapterFolder } from '../app/plugin/vaultFolders';
import type { StorageApi } from './types/settings';

const EXTENSION_ID = /^[a-z0-9-]+$/;

export function storageFolderOf(extensionId: string): string {
  return `atlas-vtt/.atlas-data/extensions/${extensionId}`;
}

export function storageApi(app: App, extensionId: string): StorageApi {
  let ready: Promise<string> | null = null;
  return Object.freeze({
    folder: (): Promise<string> => {
      // Checked here, not at connect: an odd id must still get the other namespaces.
      if (!EXTENSION_ID.test(extensionId)) {
        return Promise.reject(new Error(`[Atlas API] "${extensionId}" cannot have a storage folder: the extension id must be kebab-case (a-z, 0-9, -).`));
      }
      const folder = storageFolderOf(extensionId);
      ready ??= ensureAdapterFolder(app, folder).then(() => folder, (error: unknown) => {
        ready = null;
        throw error;
      });
      return ready;
    },
  });
}
