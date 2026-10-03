/**
 * Each pulled note's merge history, in `history/<base key>.json` in Atlas's sharing data: the
 * text every merge or Take theirs replaced, newest last, at most 20. Undo restores the newest.
 */
import type { App } from 'obsidian';
import { readText, removeFile, SHARING_DATA_DIR, writeText, type DataAdapterLike } from '../dataFile';
import type { PulledRecord } from '../receive/PulledItems';
import { fileAt } from '../receive/vaultFiles';

export interface MergeEntry {
  at: number;
  before: string;
  after: string;
}

export const MAX_MERGE_ENTRIES = 20;

function parseEntries(text: string | null): MergeEntry[] {
  if (!text) return [];
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value)
      ? value.filter((entry): entry is MergeEntry => typeof entry === 'object' && entry !== null
        && typeof (entry as MergeEntry).before === 'string' && typeof (entry as MergeEntry).after === 'string'
        && typeof (entry as MergeEntry).at === 'number')
      : [];
  } catch {
    return [];
  }
}

export class MergeHistory {
  constructor(private readonly adapter: DataAdapterLike) {}

  async entries(record: PulledRecord): Promise<MergeEntry[]> {
    return parseEntries(await readText(this.adapter, this.path(record)));
  }

  async add(record: PulledRecord, entry: MergeEntry): Promise<void> {
    const entries = [...(await this.entries(record)), entry].slice(-MAX_MERGE_ENTRIES);
    await writeText(this.adapter, this.path(record), JSON.stringify(entries));
  }

  async pop(record: PulledRecord): Promise<MergeEntry | null> {
    const entries = await this.entries(record);
    const last = entries.pop() ?? null;
    if (entries.length > 0) await writeText(this.adapter, this.path(record), JSON.stringify(entries));
    else await removeFile(this.adapter, this.path(record));
    return last;
  }

  private path(record: PulledRecord): string {
    return `${SHARING_DATA_DIR}/history/${record.baseKey}.json`;
  }
}

/**
 * Restores the text the last merge replaced, in the file the record owns (a record whose file
 * was deleted owns none, so nothing is touched). Asks first when the note changed since.
 * False when nothing was undone.
 */
export async function undoLastMerge(app: App, history: MergeHistory, record: PulledRecord, confirmChanged: () => Promise<boolean>): Promise<boolean> {
  const last = (await history.entries(record)).at(-1);
  const file = fileAt(app, record.path);
  if (!last || !file) return false;
  if ((await app.vault.read(file)) !== last.after && !(await confirmChanged())) return false;
  await app.vault.process(file, () => last.before);
  await history.pop(record);
  return true;
}
