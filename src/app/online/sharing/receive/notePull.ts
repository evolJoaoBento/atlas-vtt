/**
 * Writes a pulled note. A first pull goes to `Shared/<person>/<title>.md` (free name, checked
 * to stay inside). A later pull compares three texts: the base (last pulled), mine (the file
 * now) and theirs (just pulled). One-sided changes resolve themselves; when both changed, the
 * update policy decides (merge/noteUpdate.ts: the note's choice, or the receiver's answer).
 */
import type { App } from 'obsidian';
import { ensureFolder } from '../../../plugin/vaultFolders';
import type { CatalogueItem } from '../model/SenderCatalogue';
import type { PulledItems, PulledRecord } from './PulledItems';
import { freePath, isInside, safeFileName, sharedNoteFolder } from './safePaths';
import { fileAt, folderOf, pathTaken } from './vaultFiles';

export interface UpdateContext {
  record: PulledRecord;
  title: string;
  personName: string;
  base: string;
  mine: string;
  theirs: string;
}

/** `write`: replace the note with `text`; `keep`: leave it; `both`: save theirs beside it; `cancel`: change nothing. */
export type UpdateResult = { kind: 'write'; text: string } | { kind: 'keep' } | { kind: 'both' } | { kind: 'cancel' };

export interface NoteUpdatePolicy {
  resolve(context: UpdateContext): Promise<UpdateResult>;
}

export const keepBothPolicy: NoteUpdatePolicy = { resolve: async () => ({ kind: 'both' }) };

export type PullOutcome =
  | { kind: 'created' | 'updated' | 'unchanged' | 'kept' | 'both'; path: string }
  | { kind: 'cancelled' };

export interface NotePullDeps {
  app: App;
  pulled: PulledItems;
  policy: NoteUpdatePolicy;
  /** The text a merge or Take theirs replaced goes to the note's merge history. */
  replaced?(record: PulledRecord, before: string, after: string): Promise<void>;
  now?: () => number;
}

export interface NotePullInput {
  tableId: string;
  from: string;
  personName: string;
  item: CatalogueItem;
  text: string;
}

/** A new note in `folder` (the vault root when empty, where the receiver moved a pulled note themselves). */
async function create(deps: NotePullDeps, folder: string, stem: string, text: string): Promise<string> {
  const { app, pulled } = deps;
  const path = freePath(folder, stem, 'md', (candidate) => pathTaken(app, pulled, candidate));
  if (folder && !isInside(path, folder)) throw new Error('A shared note would land outside its folder');
  if (folder) await ensureFolder(app, folder);
  await app.vault.create(path, text);
  return path;
}

export async function pullNote(deps: NotePullDeps, input: NotePullInput): Promise<PullOutcome> {
  const { app, pulled } = deps;
  const now = deps.now ?? Date.now;
  await pulled.ready();
  const known = pulled.get(input.tableId, input.from, input.item.item);
  const file = known ? fileAt(app, known.path) : null;
  const folder = sharedNoteFolder(input.personName);
  const stem = safeFileName(input.item.title);
  // Read at the end, so choices the update policy remembered meanwhile stay. The record keeps the version pulled.
  const record = (path: string): PulledRecord => {
    const latest = pulled.get(input.tableId, input.from, input.item.item);
    const changes = { path, version: input.item.version, pulledAt: now() };
    return (latest ? pulled.update(latest.key, changes) : null)
      ?? pulled.put({ tableId: input.tableId, from: input.from, item: input.item.item, kind: 'note', ...changes });
  };
  if (!known || !file) {
    const path = await create(deps, folder, stem, input.text);
    await pulled.writeBase(record(path), input.text);
    return { kind: 'created', path };
  }
  const mine = await app.vault.read(file);
  const base = (await pulled.readBase(known)) ?? mine;
  const theirs = input.text;
  const settle = async (kind: 'updated' | 'unchanged' | 'kept' | 'both', path = known.path): Promise<PullOutcome> => {
    await pulled.writeBase(record(known.path), theirs);
    return { kind, path };
  };
  if (theirs === base || theirs === mine) return settle('unchanged');
  if (mine === base) {
    await app.vault.process(file, () => theirs);
    return settle('updated');
  }
  const result = await deps.policy.resolve({ record: known, title: input.item.title, personName: input.personName, base, mine, theirs });
  switch (result.kind) {
    case 'cancel':
      return { kind: 'cancelled' };
    case 'keep':
      return settle('kept');
    case 'both':
      // Beside the note wherever it is now, so it follows the receiver's own moves (the vault root when the note sits there).
      return settle('both', await create(deps, folderOf(known.path), safeFileName(`${input.item.title} (from ${input.personName})`), theirs));
    case 'write':
      // The merge may have taken a while: what is in the file now is what gets replaced, so it is what the history keeps.
      await deps.replaced?.(known, await app.vault.read(file), result.text);
      await app.vault.process(file, () => result.text);
      return settle('updated');
  }
}
