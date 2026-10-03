import { describe, expect, it, vi } from 'vitest';
import type { CatalogueItem } from '../../../../src/app/online/sharing/model/SenderCatalogue';
import { keepBothPolicy, pullNote, type NotePullDeps, type NoteUpdatePolicy } from '../../../../src/app/online/sharing/receive/notePull';
import { PulledItems } from '../../../../src/app/online/sharing/receive/PulledItems';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { TABLE_ID } from './sharingFixtures';

const item = (title: string, version: string, id = 'i'.repeat(22)): CatalogueItem => ({ item: id, kind: 'note', title, version, size: 1 });
const V1 = '1'.repeat(43);
const V2 = '2'.repeat(43);

async function setup(policy: NoteUpdatePolicy = keepBothPolicy) {
  const { app, files } = createInMemoryApp();
  const pulled = PulledItems.create(app.vault.adapter);
  await pulled.ready();
  const deps: NotePullDeps = { app, pulled, policy };
  const pull = (catalogueItem: CatalogueItem, text: string, personName = 'Ana') =>
    pullNote(deps, { tableId: TABLE_ID, from: 'ana', personName, item: catalogueItem, text });
  return { app, files, pulled, pull };
}

describe('pulling a note', () => {
  it('writes the first pull to Shared/<person>/ and keeps the text as the base and the version pulled', async () => {
    const { files, pulled, pull } = await setup();
    expect(await pull(item('Goblin cave', V1), 'The cave.')).toEqual({ kind: 'created', path: 'Shared/Ana/Goblin cave.md' });
    expect(files.get('Shared/Ana/Goblin cave.md')).toBe('The cave.');
    const record = pulled.get(TABLE_ID, 'ana', 'i'.repeat(22))!;
    expect(record).toMatchObject({ path: 'Shared/Ana/Goblin cave.md', version: V1, kind: 'note' });
    expect(await pulled.readBase(record)).toBe('The cave.');
  });

  it('a share can never write outside its folder, and two items never share a file', async () => {
    const { files, pull } = await setup();
    expect((await pull(item('../../.obsidian/plugins/evil', V1), 'x', '../../root') as { path: string }).path).toBe('Shared/root/obsidian plugins evil.md');
    expect((await pull(item('Cave', V1, 'a'.repeat(22)), 'one') as { path: string }).path).toBe('Shared/Ana/Cave.md');
    expect((await pull(item('Cave', V1, 'b'.repeat(22)), 'two') as { path: string }).path).toBe('Shared/Ana/Cave (2).md');
    // Everything in the vault is under Shared/; the base texts live in Atlas's sharing data.
    expect([...files.keys()].filter((path) => !path.startsWith('atlas-vtt/.atlas-data/')).every((path) => path.startsWith('Shared/'))).toBe(true);
  });

  it('updates a note the receiver left alone, and leaves an up-to-date one', async () => {
    const { files, pull } = await setup();
    await pull(item('Cave', V1), 'one');
    expect(await pull(item('Cave', V1), 'one')).toMatchObject({ kind: 'unchanged' });
    expect(await pull(item('Cave', V2), 'two')).toMatchObject({ kind: 'updated' });
    expect(files.get('Shared/Ana/Cave.md')).toBe('two');
  });

  it('keeps the receiver’s edits when only they changed, and asks when both did', async () => {
    const policy = { resolve: vi.fn(keepBothPolicy.resolve) };
    const { files, pull } = await setup(policy);
    await pull(item('Cave', V1), 'one');
    files.set('Shared/Ana/Cave.md', 'mine');
    expect(await pull(item('Cave', V1), 'one')).toMatchObject({ kind: 'unchanged' });
    expect(files.get('Shared/Ana/Cave.md')).toBe('mine');
    expect(await pull(item('Cave', V2), 'theirs')).toEqual({ kind: 'both', path: 'Shared/Ana/Cave (from Ana).md' });
    expect(policy.resolve).toHaveBeenCalledWith(expect.objectContaining({ base: 'one', mine: 'mine', theirs: 'theirs', title: 'Cave', personName: 'Ana' }));
    expect(files.get('Shared/Ana/Cave.md')).toBe('mine');
    expect(files.get('Shared/Ana/Cave (from Ana).md')).toBe('theirs');
  });

  it('writes a new copy when the pulled note was deleted', async () => {
    const { files, pull } = await setup();
    await pull(item('Cave', V1), 'one');
    files.delete('Shared/Ana/Cave.md');
    expect(await pull(item('Cave', V2), 'two')).toEqual({ kind: 'created', path: 'Shared/Ana/Cave.md' });
  });

  it('follows a renamed or moved pulled note', async () => {
    const { pulled, pull } = await setup();
    await pull(item('Cave', V1), 'one');
    pulled.renamed('Shared/Ana', 'Shared/Ana2');
    expect(pulled.get(TABLE_ID, 'ana', 'i'.repeat(22))?.path).toBe('Shared/Ana2/Cave.md');
    pulled.renamed('Shared/Anabel', 'Elsewhere');
    expect(pulled.get(TABLE_ID, 'ana', 'i'.repeat(22))?.path).toBe('Shared/Ana2/Cave.md');
  });
});
