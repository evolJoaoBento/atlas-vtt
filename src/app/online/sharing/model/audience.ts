/** Who a rule or a part of a note reaches. A recipient is a person at a table; names resolve through the people list. */
import { keyOf, personKey, type Person } from '../people/peopleTypes';
import type { PartRule } from './privateTags';
import type { ShareRule } from './shareRule';

export interface Recipient {
  tableId: string;
  personId: string;
}

export interface NameResolver {
  /** The person a name means for `only`: the one called that now, else the one who was. */
  byName(name: string): Person | null;
  /** Everyone a name matches, current or former; `except` excludes them all. Without it, `byName` alone. */
  allByName?(name: string): Person[];
}

/** Whether `person` is the recipient, or was merged with them. */
export function isPerson(person: Person, recipient: Recipient): boolean {
  const key = personKey(recipient.tableId, recipient.personId);
  return keyOf(person) === key || person.aliases.includes(key);
}

function resolve(names: readonly string[], people: NameResolver, every = false): { known: Person[]; unknown: number } {
  const known: Person[] = [];
  let unknown = 0;
  for (const name of names) {
    const matches = every && people.allByName ? people.allByName(name) : [people.byName(name)].filter((person): person is Person => person !== null);
    if (matches.length > 0) known.push(...matches);
    else unknown++;
  }
  return { known, unknown };
}

/** An unknown name in `except` reaches nobody (fail closed); in `only` it matches nobody. */
export function ruleReaches(rule: ShareRule, recipient: Recipient, people: NameResolver): boolean {
  if (rule.private) return false;
  const except = resolve(rule.except, people, true);
  if (except.unknown > 0 || except.known.some((person) => isPerson(person, recipient))) return false;
  if (rule.public) return true;
  return resolve(rule.only, people).known.some((person) => isPerson(person, recipient));
}

/** Whether a part tag lets the recipient in: unknown names in `only` match nobody, in `except` hide from everyone. */
export function partAllows(rule: PartRule, recipient: Recipient, people: NameResolver): boolean {
  if (rule.kind === 'private') return false;
  const names = resolve(rule.names, people, rule.kind === 'except');
  if (rule.kind === 'only') return names.known.some((person) => isPerson(person, recipient));
  return names.unknown === 0 && !names.known.some((person) => isPerson(person, recipient));
}
