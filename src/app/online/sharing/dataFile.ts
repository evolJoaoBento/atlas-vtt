/**
 * Atlas's sharing data, in `atlas-vtt/.atlas-data/sharing/`: a dot folder, which Obsidian does
 * not index, so neither the vault check nor search ever sees it. Read and written through the
 * adapter. A file's writes are queued, so it always ends as the last value saved.
 */
import type { DataAdapter } from 'obsidian';
import { ensureAdapterFolder } from '../../plugin/vaultFolders';

export const SHARING_DATA_DIR = 'atlas-vtt/.atlas-data/sharing';

export type DataAdapterLike = Pick<DataAdapter, 'exists' | 'read' | 'write' | 'mkdir' | 'remove'>;

const parentOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));

export async function writeText(adapter: DataAdapterLike, path: string, text: string): Promise<void> {
  await ensureAdapterFolder({ vault: { adapter } }, parentOf(path));
  await adapter.write(path, text);
}

/** The file's text; null when there is none or it cannot be read. */
export async function readText(adapter: DataAdapterLike, path: string): Promise<string | null> {
  try {
    return (await adapter.exists(path)) ? await adapter.read(path) : null;
  } catch {
    return null;
  }
}

export async function removeFile(adapter: DataAdapterLike, path: string): Promise<void> {
  if (await adapter.exists(path)) await adapter.remove(path);
}

export class JsonDataFile<T> {
  private queue: Promise<void> = Promise.resolve();

  /** `parse` turns whatever is stored (null for nothing) into a value, dropping what it cannot read. */
  constructor(private readonly adapter: DataAdapterLike, readonly path: string, private readonly parse: (value: unknown) => T) {}

  async load(): Promise<T> {
    const text = await readText(this.adapter, this.path);
    if (text === null) return this.parse(null);
    try {
      return this.parse(JSON.parse(text));
    } catch (error) {
      console.error(`[Atlas sharing] ${this.path} is not readable; starting from empty.`, error);
      return this.parse(null);
    }
  }

  save(value: T): Promise<void> {
    const text = JSON.stringify(value, null, 2);
    this.queue = this.queue
      .then(() => writeText(this.adapter, this.path, text))
      .catch((error: unknown) => console.error(`[Atlas sharing] Could not save ${this.path}:`, error));
    return this.queue;
  }
}
