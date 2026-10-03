import { normalizePath, TFile, type App } from 'obsidian';

/** The vault file at `path`; null when there is none or it is a folder. */
export function fileAt(app: App, path: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  return file instanceof TFile ? file : null;
}

/** The folder part of a vault path. */
export const folderOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));
