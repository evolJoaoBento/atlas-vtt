import { describe, expect, it, vi } from 'vitest';
import type { SessionPlayer } from '../../../../src/app/online/GmSession';
import { JsonDataFile, SHARING_DATA_DIR } from '../../../../src/app/online/sharing/dataFile';
import { hostedTable } from '../../../../src/app/online/sharing/identity/reissue';
import { makeDeviceProof } from '../../../../src/app/online/sharing/identity/proofs';
import { isPerson, partAllows, ruleReaches } from '../../../../src/app/online/sharing/model/audience';
import { mapShareReaches, type MapShare } from '../../../../src/app/online/sharing/model/mapShare';
import { unknownNamesIn } from '../../../../src/app/online/sharing/model/noteFilter';
import { parseShareRule, unknownRuleNames } from '../../../../src/app/online/sharing/model/shareRule';
import { IdentityDesk } from '../../../../src/app/online/sharing/people/IdentityDesk';
import { PeopleBook } from '../../../../src/app/online/sharing/people/PeopleBook';
import { parsePeopleData, personKey } from '../../../../src/app/online/sharing/people/peopleTypes';
import { placeholderKey, parsePlaceholders } from '../../../../src/app/online/sharing/people/placeholderTypes';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { noteCatalogue, nodeIdentityCrypto as crypto, testPeople, testPerson, testTable } from './sharingFixtures';

const T = 'T'.repeat(43);
const U = 'U'.repeat(43);
const D1 = 'a'.repeat(43);
const D2 = 'b'.repeat(43);
const FILE = `${SHARING_DATA_DIR}/people.json`;
const dave = { name: 'Dave', formerNames: [] };

function book(app = createInMemoryApp().app): PeopleBook {
  return new PeopleBook(new JsonDataFile(app.vault.adapter, FILE, parsePeopleData), () => 1000);
}

describe('people added by name', () => {
  it('adds a placeholder with no ids, devices or table, and keeps it across a reload', async () => {
    const { app } = createInMemoryApp();
    const people = book(app);
    await people.ready();
    expect(people.addPlaceholder('  Dave ')).toBeNull();
    expect(people.placeholders()).toEqual([dave]);
    expect(people.list()).toEqual([]);
    expect(people.byName('Dave')).toBeNull();
    expect(people.isPlaceholder('DAVE')).toBe(true);
    await vi.waitFor(async () => expect(await app.vault.adapter.read(FILE)).toContain('placeholders'));
    const again = book(app);
    await again.ready();
    expect(again.placeholders()).toEqual([dave]);
  });

  it('refuses a name that is taken, now or formerly, by a person, a placeholder or someone removed, and never suffixes it', async () => {
    const people = book();
    await people.ready();
    const ana = people.admit(T, 'Ana', D1);
    people.rename(personKey(T, ana.personId), 'Anna');
    const ben = people.admit(T, 'Ben', D2);
    people.remove(personKey(T, ben.personId));
    expect(people.addPlaceholder('Dave')).toBeNull();
    for (const taken of ['anna', 'ANA', 'Ben', 'dave']) {
      expect(people.addPlaceholder(taken)).toBe(`Someone in your people list is already called ${taken}.`);
    }
    expect(people.placeholders().map((placeholder) => placeholder.name)).toEqual(['Dave']);
    expect(people.addPlaceholder('   ')).toBe('Enter a name of up to 40 characters.');
    expect(people.addPlaceholder('x'.repeat(41))).toBe('Enter a name of up to 40 characters.');
  });

  it('keeps its name away from people who join with it: they become "Dave (2)"', async () => {
    const people = book();
    await people.ready();
    people.addPlaceholder('Dave');
    expect(people.admit(T, 'dave', D1).name).toBe('dave (2)');
    expect(people.seen(U, 'p1', 'Dave').name).toBe('Dave (3)');
    expect(people.placeholders()).toEqual([dave]);
  });

  it('renames (the old name stays) and removes (the names stay taken)', async () => {
    const people = book();
    await people.ready();
    people.addPlaceholder('Dave');
    people.addPlaceholder('Eve');
    expect(people.renamePlaceholder('Dave', 'Eve')).toBe('Someone in your people list is already called Eve.');
    expect(people.renamePlaceholder('Dave', 'David')).toBeNull();
    expect(people.placeholderByName('Dave')?.name).toBe('David');
    expect(people.addPlaceholder('Dave')).not.toBeNull();
    people.removePlaceholder('David');
    expect(people.isPlaceholder('David')).toBe(false);
    expect(people.admit(T, 'David', D1).name).toBe('David (2)');
    expect(people.admit(T, 'Dave', D2).name).toBe('Dave (2)');
  });

  it('tolerates older files and damaged entries', () => {
    expect(parsePeopleData({ version: 1, people: [] }).placeholders).toEqual([]);
    expect(parsePeopleData({ version: 1, people: [], placeholders: 'x' }).placeholders).toEqual([]);
    expect(parsePeopleData(null).placeholders).toEqual([]);
    expect(parsePlaceholders([
      { name: 'Dave', formerNames: ['Davey', 3, ''] }, { name: 'dave' }, { name: '' }, { name: 5 }, null, 'x', { formerNames: [] }, { name: 'Eve' },
    ])).toEqual([{ name: 'Dave', formerNames: ['Davey'] }, { name: 'Eve', formerNames: [] }]);
  });
});

describe('a placeholder grants nothing', () => {
  const ana = testPerson('ana', 'Ana');
  const people = testPeople([ana], [dave]);
  const ruleOf = (value: unknown) => parseShareRule(value);
  const recipient = { tableId: ana.tableId, personId: 'ana' };

  it('only|Dave and atlas-share: [Dave] reach nobody, and are no longer "unknown"', () => {
    expect(ruleReaches(ruleOf(['Dave']), recipient, people)).toBe(false);
    expect(partAllows({ kind: 'only', names: ['Dave'] }, recipient, people)).toBe(false);
    expect(partAllows({ kind: 'only', names: ['Dave', 'Ana'] }, recipient, people)).toBe(true);
    expect(unknownRuleNames(ruleOf(['Dave', 'Zed']), people)).toEqual(['Zed']);
    expect(unknownNamesIn('---\natlas-share: [Dave]\n---\n%%[!only|Dave, Zed]%%x%%[!end]%%', people)).toEqual(['Zed']);
  });

  it('except|Dave excludes nobody real, where an unknown name hides the part from everyone', () => {
    expect(partAllows({ kind: 'except', names: ['Dave'] }, recipient, people)).toBe(true);
    expect(partAllows({ kind: 'except', names: ['Zed'] }, recipient, people)).toBe(false);
    expect(ruleReaches(ruleOf(['public', 'except Dave']), recipient, people)).toBe(true);
    expect(ruleReaches(ruleOf(['public', 'except Zed']), recipient, people)).toBe(false);
  });

  it('a resolver that cannot tell placeholders treats the name as unknown, which is the stricter outcome', () => {
    const plain = { byName: people.byName, allByName: people.allByName };
    expect(partAllows({ kind: 'except', names: ['Dave'] }, recipient, plain)).toBe(false);
    expect(partAllows({ kind: 'only', names: ['Dave'] }, recipient, plain)).toBe(false);
  });

  it('a map share with a placeholder key reaches nobody until linked, then the linked person', async () => {
    const share = (key: string, field: 'people' | 'except'): MapShare => ({
      item: 'i'.repeat(22), everyone: field === 'except', people: field === 'people' ? [key] : [], except: field === 'except' ? [key] : [], mode: 'full', notes: [],
    });
    const key = placeholderKey('Dave');
    const real = book();
    await real.ready();
    real.addPlaceholder('Dave');
    const eve = real.admit(T, 'Eve', D1);
    expect(mapShareReaches(share(key, 'people'), { tableId: T, personId: eve.personId }, real)).toBe(false);
    expect(mapShareReaches(share(key, 'except'), { tableId: T, personId: eve.personId }, real)).toBe(true);
    const linked = real.admitAsPlaceholder(T, 'Dave', D2)!;
    const recipientOf = { tableId: T, personId: linked.personId };
    expect(mapShareReaches(share(key, 'people'), recipientOf, real)).toBe(true);
    expect(mapShareReaches(share(key, 'except'), recipientOf, real)).toBe(false);
    expect(mapShareReaches(share(key, 'except'), { tableId: T, personId: eve.personId }, real)).toBe(true);
  });
});

describe('meeting a placeholder', () => {
  const player = (playerId: string, name: string): SessionPlayer => ({ playerId, name, status: 'pending', client: 'obsidian' });
  async function setup() {
    const table = await testTable();
    const people = book();
    const desk = new IdentityDesk({ people, table: hostedTable(crypto, table, 'host-1', () => 'Morgan') });
    const device = async () => {
      const keys = await crypto.generate();
      const deviceId = await crypto.keyId(keys.publicKey);
      return { deviceId, proof: (nonce: string) => makeDeviceProof(crypto, keys, table.id, 'host-1', nonce) };
    };
    return { table, people, desk, device };
  }

  it('flags a new device with a placeholder’s name, and linking binds the identity to it, keeping name and references', async () => {
    const { table, people, desk, device } = await setup();
    await people.ready();
    people.addPlaceholder('Dave');
    const phone = await device();
    expect(await desk.identify(player('p1', 'dave'), await phone.proof('nonce-aaaaaaaaaaaaaaaa')))
      .toEqual({ kind: 'new', sameName: { personId: null, name: 'Dave' } });
    const result = await desk.admission('p1', { placeholder: 'Dave' });
    if ('refused' in result) throw new Error('refused');
    const person = people.get(table.id, result.admission.personId)!;
    expect(person).toMatchObject({ name: 'Dave', devices: [phone.deviceId] });
    expect(person.aliases).toContain(placeholderKey('Dave'));
    expect(people.placeholders()).toEqual([]);
    expect(people.byName('Dave')?.personId).toBe(person.personId);
    // Their device knows them next time.
    expect(await desk.identify(player('p2', 'Anything'), await phone.proof('nonce-bbbbbbbbbbbbbbbb'))).toEqual({ kind: 'known', personId: person.personId, name: 'Dave' });
  });

  it('Allow keeps them separate: a typed name never links by itself, the new person is "Dave (2)"', async () => {
    const { people, desk, device } = await setup();
    await people.ready();
    people.addPlaceholder('Dave');
    await desk.identify(player('p1', 'Dave'), await (await device()).proof('nonce-aaaaaaaaaaaaaaaa'));
    const result = await desk.admission('p1');
    if ('refused' in result) throw new Error('refused');
    expect(people.get(people.list()[0]!.tableId, result.admission.personId)?.name).toBe('Dave (2)');
    expect(people.placeholders()).toEqual([dave]);
    expect(ruleReaches(parseShareRule(['Dave']), { tableId: people.list()[0]!.tableId, personId: result.admission.personId }, people)).toBe(false);
  });

  it('refuses to link when the placeholder is gone or the device already belongs to someone', async () => {
    const { people, desk, device } = await setup();
    await people.ready();
    people.addPlaceholder('Dave');
    const phone = await device();
    await desk.identify(player('p1', 'Dave'), await phone.proof('nonce-aaaaaaaaaaaaaaaa'));
    people.removePlaceholder('Dave');
    expect(await desk.admission('p1', { placeholder: 'Dave' })).toEqual({ refused: 'person' });
    expect(people.list()).toEqual([]);
    people.addPlaceholder('Eve');
    await desk.admission('p1');
    expect(await desk.admission('p1', { placeholder: 'Eve' })).toEqual({ refused: 'person' });
    expect(people.placeholders()).toEqual([{ name: 'Eve', formerNames: [] }]);
  });

  it('a person met in a session is never linked on their own; linking in People merges them and keeps every name', async () => {
    const people = book();
    await people.ready();
    people.addPlaceholder('Dave');
    people.renamePlaceholder('Dave', 'David');
    const met = people.seen(U, 'dave1', 'Dave');
    expect(met.name).toBe('Dave (2)');
    expect(people.placeholders()).toHaveLength(1);
    expect(people.linkPlaceholder(personKey(U, 'dave1'), 'David')).toBeNull();
    const linked = people.get(U, 'dave1')!;
    expect(linked).toMatchObject({ name: 'David', devices: [] });
    expect(linked.formerNames).toEqual(expect.arrayContaining(['Dave', 'Dave (2)']));
    expect(people.placeholders()).toEqual([]);
    for (const name of ['David', 'Dave', 'Dave (2)']) expect(people.byName(name)?.personId).toBe('dave1');
    expect(isPerson(linked, { tableId: U, personId: 'dave1' })).toBe(true);
    expect(people.linkPlaceholder(personKey(U, 'dave1'), 'Nobody')).toBe('Pick another person.');
  });
});

describe('preview as a placeholder', () => {
  const text = 'Open. %%[!only|Dave]%%Dave’s secret. %%[!end]%%%%[!except|Dave]%%Not for Dave. %%[!end]%%%%[!only|Ana]%%Ana’s. %%[!end]%%';

  it('shows what they would get once linked, and nothing real is touched', async () => {
    const ana = testPerson('ana', 'Ana');
    const catalogue = noteCatalogue({ 'N.md': { text, share: ['Dave'] } }, [ana], [dave]);
    const got = await catalogue.previewNoteAsPlaceholder('Dave', 'N.md');
    expect(got).toContain('Open.');
    expect(got).toContain('Dave’s secret.');
    expect(got).not.toContain('Not for Dave.');
    expect(got).not.toContain('Ana’s.');
    // The real recipients, and the people list, are unchanged.
    const asAna = await catalogue.previewNote({ tableId: ana.tableId, personId: 'ana' }, 'N.md');
    expect(asAna).toContain('Not for Dave.');
    expect(asAna).not.toContain('Dave’s secret.');
    expect(await catalogue.list({ tableId: ana.tableId, personId: 'ana' })).toEqual([]);
    expect(await catalogue.previewNoteAsPlaceholder('Nobody', 'N.md')).toBeNull();
  });

  it('never shows the placeholder a note it does not share, as a real stand-in would not be listed either', async () => {
    const catalogue = noteCatalogue({ 'N.md': { text: 'Hi', share: ['Ana'] } }, [testPerson('ana', 'Ana')], [dave]);
    expect(await catalogue.list({ tableId: 'preview', personId: 'placeholder' })).toEqual([]);
  });
});
