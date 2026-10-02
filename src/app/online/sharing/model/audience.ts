/** Who a rule or a callout reaches. A recipient is a person at a table; names resolve through the people list. */
import { keyOf, personKey, type Person } from '../people/peopleTypes';
import type { CalloutRule } from './noteFilter';
import type { ShareRule } from './shareRule';

export interface Recipient {
  tableId: string;
  personId: string;
}

export interface NameResolver {
  byName(name: string): Person | null;
}

/** Whether `person` is the recipient, or was merged with them. */
export function isPerson(person: Person, recipient: Recipient): boolean {
  const key = personKey(recipient.tableId, recipient.personId);
  return keyOf(person) === key || person.aliases.includes(key);
}

function resolve(names: readonly string[], people: NameResolver): { known: Person[]; unknown: number } {
  const known: Person[] = [];
  let unknown = 0;
  for (const name of names) {
    const person = people.byName(name);
    if (person) known.push(person);
    else unknown++;
  }
  return { known, unknown };
}

/** An unknown name in `except` reaches nobody (fail closed); in `only` it matches nobody. */
export function ruleReaches(rule: ShareRule, recipient: Recipient, people: NameResolver): boolean {
  if (rule.private) return false;
  const except = resolve(rule.except, people);
  if (except.unknown > 0 || except.known.some((person) => isPerson(person, recipient))) return false;
  if (rule.public) return true;
  return resolve(rule.only, people).known.some((person) => isPerson(person, recipient));
}

export function calloutAllows(rule: CalloutRule, recipient: Recipient, people: NameResolver): boolean {
  if (rule.kind === 'private') return false;
  const names = resolve(rule.names, people);
  if (rule.kind === 'only') return names.known.some((person) => isPerson(person, recipient));
  return names.unknown === 0 && !names.known.some((person) => isPerson(person, recipient));
}
