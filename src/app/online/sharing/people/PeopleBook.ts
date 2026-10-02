/**
 * The people list of this Atlas, kept in `people.json` in Atlas's sharing data. People are
 * added when the GM admits them or when a player meets them in a session; their device and
 * person ids, never their names, decide who they are. Names stay unique in the list.
 */
import type { App } from 'obsidian';
import { randomId } from '../../ids';
import { normalizePlayerName } from '../../protocol';
import { JsonDataFile, SHARING_DATA_DIR } from '../dataFile';
import { nameKey, uniqueName } from './peopleNames';
import { keyOf, parsePeopleData, type PeopleData, type Person } from './peopleTypes';

export const PEOPLE_FILE = `${SHARING_DATA_DIR}/people.json`;
const NAME_PROBLEM = 'Enter a name of up to 40 characters.';
/** A change of only `lastSeen` is saved this long after the last one; any other change is saved at once. */
const LAST_SEEN_SAVE_DELAY_MS = 10_000;
/** Meeting someone again within this time leaves their last-seen time alone. */
const LAST_SEEN_RESOLUTION_MS = 60_000;

export class PeopleBook {
  private static readonly instances = new WeakMap<App, PeopleBook>();
  static forApp(app: App): PeopleBook {
    let book = this.instances.get(app);
    if (!book) {
      book = new PeopleBook(new JsonDataFile(app.vault.adapter, PEOPLE_FILE, parsePeopleData));
      this.instances.set(app, book);
    }
    return book;
  }

  private people: Person[] = [];
  private loading: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private saveTimer: number | null = null;
  /** The stored list has been read: nothing is written before, or the stored list would be replaced by an empty one. */
  private loaded = false;

  constructor(private readonly file: JsonDataFile<PeopleData>, private readonly now: () => number = Date.now) {}

  /** Reads the stored list once; every other method expects it read. */
  ready(): Promise<void> {
    this.loading ??= this.file.load().then((data) => {
      this.people = data.people;
      this.loaded = true;
      this.listeners.forEach((listener) => listener());
    });
    return this.loading;
  }

  list(): readonly Person[] {
    return this.people;
  }

  get(tableId: string, personId: string): Person | null {
    return this.byKey(`${tableId}/${personId}`);
  }

  /** The person with this key, or the one it was merged into. */
  byKey(key: string): Person | null {
    return this.people.find((person) => keyOf(person) === key) ?? this.people.find((person) => person.aliases.includes(key)) ?? null;
  }

  byDevice(tableId: string, deviceId: string): Person | null {
    return this.people.find((person) => person.tableId === tableId && person.devices.includes(deviceId)) ?? null;
  }

  /** The person called `name` now, else the one who was called that most recently; optionally at one table. */
  byName(name: string, tableId?: string): Person | null {
    const key = nameKey(name);
    const candidates = tableId ? this.people.filter((person) => person.tableId === tableId) : this.people;
    return candidates.find((person) => nameKey(person.name) === key)
      ?? [...candidates].sort((a, b) => b.lastSeen - a.lastSeen).find((person) => person.formerNames.some((former) => nameKey(former) === key))
      ?? null;
  }

  /** Everyone a name matches, now or formerly (names are unique, so older data is the only way to get more than one). */
  allByName(name: string, tableId?: string): Person[] {
    const key = nameKey(name);
    return this.people.filter((person) => (!tableId || person.tableId === tableId)
      && (nameKey(person.name) === key || person.formerNames.some((former) => nameKey(former) === key)));
  }

  /** The GM admits a new device as a new person. */
  admit(tableId: string, name: string, deviceId: string): Person {
    const person: Person = {
      tableId, personId: randomId(), name: this.freeName(name), formerNames: [], devices: [deviceId], aliases: [], lastSeen: this.now(),
    };
    this.people = [...this.people, person];
    this.changed(true);
    return person;
  }

  /** The GM links a new device to a known person; null when there is no such person. */
  linkDevice(tableId: string, personId: string, deviceId: string): Person | null {
    const person = this.get(tableId, personId);
    if (!person) return null;
    return this.replace(person, { devices: person.devices.includes(deviceId) ? person.devices : [...person.devices, deviceId], lastSeen: this.now() });
  }

  /** Someone met in a session: added under a free name if new, otherwise only their last-seen time changes. */
  seen(tableId: string, personId: string, name: string): Person {
    const known = this.get(tableId, personId);
    if (known) return this.now() - known.lastSeen < LAST_SEEN_RESOLUTION_MS ? known : this.replace(known, { lastSeen: this.now() });
    const person: Person = { tableId, personId, name: this.freeName(name), formerNames: [], devices: [], aliases: [], lastSeen: this.now() };
    this.people = [...this.people, person];
    this.changed(true);
    return person;
  }

  /** Renames; the old name stays a former name. Returns what is wrong with the name, or null. */
  rename(key: string, name: string): string | null {
    const person = this.byKey(key);
    const cleaned = normalizePlayerName(name);
    if (!person) return null;
    if (!cleaned) return NAME_PROBLEM;
    if (nameKey(cleaned) === nameKey(person.name)) {
      this.replace(person, { name: cleaned });
      return null;
    }
    if (this.nameTaken(nameKey(cleaned), person)) {
      return `Someone in your people list is already called ${cleaned}.`;
    }
    this.replace(person, { name: cleaned, formerNames: [...person.formerNames.filter((former) => nameKey(former) !== nameKey(cleaned)), person.name] });
    return null;
  }

  /** Merges `fromKey` into `intoKey`: one person on two devices or at two tables. */
  merge(fromKey: string, intoKey: string): string | null {
    const from = this.byKey(fromKey);
    const into = this.byKey(intoKey);
    if (!from || !into || from === into) return 'Pick another person.';
    const people = this.people.filter((person) => person !== from);
    const merged: Person = {
      ...into,
      devices: [...new Set([...into.devices, ...from.devices])],
      formerNames: [...new Set([...into.formerNames, from.name, ...from.formerNames])],
      aliases: [...new Set([...into.aliases, keyOf(from), ...from.aliases])],
      lastSeen: Math.max(into.lastSeen, from.lastSeen),
    };
    this.people = people.map((person) => (person === into ? merged : person));
    this.changed(true);
    return null;
  }

  remove(key: string): void {
    const person = this.byKey(key);
    if (!person) return;
    this.people = this.people.filter((other) => other !== person);
    this.changed(true);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** A current or former name of anyone (but `except`): a former name is never given to someone else. */
  private nameTaken(key: string, except?: Person): boolean {
    return this.people.some((other) => other !== except && (nameKey(other.name) === key || other.formerNames.some((former) => nameKey(former) === key)));
  }

  private freeName(name: string): string {
    const cleaned = normalizePlayerName(name) ?? 'Someone';
    return uniqueName(cleaned, (key) => this.nameTaken(key));
  }

  /** Applies `changes`; the file is written at once only when something other than `lastSeen` differs. */
  private replace(person: Person, changes: Partial<Person>): Person {
    const updated = { ...person, ...changes };
    const stored = (value: Person): string => JSON.stringify({ ...value, lastSeen: 0 });
    this.people = this.people.map((other) => (other === person ? updated : other));
    this.changed(stored(updated) !== stored(person));
    return updated;
  }

  private changed(persist: boolean): void {
    if (persist) this.save();
    else if (this.loaded) this.saveTimer ??= window.setTimeout(() => this.save(), LAST_SEEN_SAVE_DELAY_MS);
    this.listeners.forEach((listener) => listener());
  }

  /** Writes a waiting last-seen change now (on unload). Writes nothing when none is waiting or the list was never read. */
  flush(): void {
    if (this.saveTimer !== null) this.save();
  }

  private save(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.loaded) void this.file.save({ version: 1, people: this.people });
  }
}
