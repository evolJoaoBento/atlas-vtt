import { describe, expect, it, vi } from 'vitest';
import { JsonDataFile, SHARING_DATA_DIR } from '../../../../src/app/online/sharing/dataFile';
import { PeopleBook } from '../../../../src/app/online/sharing/people/PeopleBook';
import { GM_PERSON_ID, parsePeopleData, personKey } from '../../../../src/app/online/sharing/people/peopleTypes';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

const T = 'T'.repeat(43);
const U = 'U'.repeat(43);
const D1 = 'a'.repeat(43);
const D2 = 'b'.repeat(43);

function book(app = createInMemoryApp().app, now = (): number => 1000): PeopleBook {
  return new PeopleBook(new JsonDataFile(app.vault.adapter, `${SHARING_DATA_DIR}/people.json`, parsePeopleData), now);
}

describe('PeopleBook', () => {
  it('admits new people with unique names and finds them by device, name and key', async () => {
    const people = book();
    await people.ready();
    const ana = people.admit(T, 'Ana', D1);
    const second = people.admit(T, 'ana', D2);
    expect(second.name).toBe('ana (2)');
    expect(people.byDevice(T, D1)).toEqual(ana);
    expect(people.byDevice(U, D1)).toBeNull();
    expect(people.byName('ANA')?.personId).toBe(ana.personId);
    expect(people.byKey(personKey(T, ana.personId))?.name).toBe('Ana');
    expect(ana.personId).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('links a new device to a known person', async () => {
    const people = book();
    await people.ready();
    const ana = people.admit(T, 'Ana', D1);
    expect(people.linkDevice(T, ana.personId, D2)?.devices).toEqual([D1, D2]);
    expect(people.byDevice(T, D2)?.personId).toBe(ana.personId);
    expect(people.linkDevice(T, 'nobody', D2)).toBeNull();
  });

  it('records people seen in a session without renaming known ones', async () => {
    const people = book();
    await people.ready();
    people.seen(T, GM_PERSON_ID, 'Morgan');
    people.seen(T, GM_PERSON_ID, 'Someone else');
    expect(people.get(T, GM_PERSON_ID)?.name).toBe('Morgan');
    // The same name at another table is another person.
    expect(people.seen(U, GM_PERSON_ID, 'Morgan').name).toBe('Morgan (2)');
  });

  it('renames by key, keeps the former name, and refuses a taken or bad name', async () => {
    const people = book();
    await people.ready();
    const ana = people.admit(T, 'Ana', D1);
    people.admit(T, 'Ben', D2);
    const key = personKey(T, ana.personId);
    expect(people.rename(key, 'Ben')).toBe('Someone in your people list is already called Ben.');
    expect(people.rename(key, '   ')).toBe('Enter a name of up to 40 characters.');
    expect(people.rename(key, 'Anna')).toBeNull();
    expect(people.byName('Anna')?.formerNames).toEqual(['Ana']);
    // Notes that still say Ana reach her.
    expect(people.byName('Ana')?.personId).toBe(ana.personId);
  });

  it('merges one person into another and removes', async () => {
    const people = book();
    await people.ready();
    const ana = people.admit(T, 'Ana', D1);
    const laptop = people.admit(T, 'Ana laptop', D2);
    expect(people.merge(personKey(T, laptop.personId), personKey(T, ana.personId))).toBeNull();
    const merged = people.get(T, ana.personId)!;
    expect(merged.devices).toEqual([D1, D2]);
    expect(merged.aliases).toEqual([personKey(T, laptop.personId)]);
    expect(merged.formerNames).toEqual(['Ana laptop']);
    expect(people.byKey(personKey(T, laptop.personId))?.personId).toBe(ana.personId);
    expect(people.list()).toHaveLength(1);
    people.remove(personKey(T, ana.personId));
    expect(people.list()).toEqual([]);
  });

  it('keeps the list in Atlas data, and survives a broken file', async () => {
    const { app, files } = createInMemoryApp();
    const first = book(app);
    await first.ready();
    first.admit(T, 'Ana', D1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(files.get(`${SHARING_DATA_DIR}/people.json`)!).people[0]).toMatchObject({ name: 'Ana', devices: [D1] });
    const second = book(app);
    await second.ready();
    expect(second.byDevice(T, D1)?.name).toBe('Ana');
    files.set(`${SHARING_DATA_DIR}/people.json`, '{not json');
    const third = book(app);
    await third.ready();
    expect(third.list()).toEqual([]);
    expect(parsePeopleData({ version: 1, people: [{ tableId: T, personId: 'bad id!', name: 'X' }, 7] }).people).toEqual([]);
  });

  it('never writes before the list is read, and flushes only a waiting last-seen change', async () => {
    const { app, files } = createInMemoryApp();
    const path = `${SHARING_DATA_DIR}/people.json`;
    const first = book(app);
    await first.ready();
    first.admit(T, 'Ana', D1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stored = files.get(path);
    // An unload before the list was ever read, or while it is being read, keeps the stored list.
    const unread = book(app);
    unread.flush();
    const reading = book(app);
    void reading.ready();
    reading.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(files.get(path)).toBe(stored);
    // Nothing waiting: flush writes nothing.
    const loaded = book(app);
    await loaded.ready();
    const writes = vi.spyOn(app.vault.adapter, 'write');
    writes.mockClear();
    loaded.flush();
    expect(writes).not.toHaveBeenCalled();
  });

  it('writes the file at once for changes, and a last-seen change only after a wait', async () => {
    vi.useFakeTimers();
    try {
      const { app, files } = createInMemoryApp();
      let time = 1000;
      const people = book(app, () => time);
      await people.ready();
      const ana = people.admit(T, 'Ana', D1);
      await vi.advanceTimersByTimeAsync(0);
      const path = `${SHARING_DATA_DIR}/people.json`;
      const written = files.get(path);
      expect(JSON.parse(written!).people[0].lastSeen).toBe(1000);
      time = 500_000;
      people.seen(T, ana.personId, 'Ana');
      await vi.advanceTimersByTimeAsync(0);
      expect(files.get(path)).toBe(written);
      expect(people.get(T, ana.personId)?.lastSeen).toBe(500_000);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(JSON.parse(files.get(path)!).people[0].lastSeen).toBe(500_000);
      // A real change takes the pending last-seen time along at once.
      time = 900_000;
      people.seen(T, ana.personId, 'Ana');
      people.rename(personKey(T, ana.personId), 'Anna');
      await vi.advanceTimersByTimeAsync(0);
      expect(JSON.parse(files.get(path)!).people[0]).toMatchObject({ name: 'Anna', lastSeen: 900_000 });
    } finally {
      vi.useRealTimers();
    }
  });
});
