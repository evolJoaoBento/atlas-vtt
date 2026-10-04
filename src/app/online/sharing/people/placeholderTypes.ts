/**
 * Someone added by name before ever meeting them. A placeholder has no table, person id or devices, so it
 * grants nothing: a tag or share that names it reaches nobody until the person is linked to it (a join the
 * GM links, or a person met in a session that the user links in the People dialog).
 */
import { nameKey } from './peopleNames';

export interface Placeholder {
  /** Unique across current and former names of the whole list (case-insensitive). */
  name: string;
  /** Names before a rename, so a note that still says the old name keeps pointing here. */
  formerNames: string[];
}

export const MAX_PLACEHOLDERS = 200;

/** The key a placeholder has in a map share's people; a person linked to it keeps it as an alias, so the share follows. */
export const placeholderKey = (name: string): string => `placeholder:${nameKey(name)}`;

/** Every key a placeholder is known by: its name now and before. */
export const placeholderKeys = (placeholder: Placeholder): string[] =>
  [...new Set([placeholder.name, ...placeholder.formerNames].map(placeholderKey))];

/** Whether the placeholder is called `name` now or was. */
export const isCalled = (placeholder: Placeholder, name: string): boolean =>
  [placeholder.name, ...placeholder.formerNames].some((own) => nameKey(own) === nameKey(name));

function parsePlaceholder(value: unknown): Placeholder | null {
  if (typeof value !== 'object' || value === null) return null;
  const { name, formerNames } = value as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim() || name.length > 80) return null;
  const former = Array.isArray(formerNames)
    ? formerNames.filter((item): item is string => typeof item === 'string' && item.trim() !== '' && item.length <= 80).slice(0, 64)
    : [];
  return { name, formerNames: former };
}

/** The stored placeholders; entries of the wrong shape are dropped, and a missing or damaged list is empty. */
export function parsePlaceholders(value: unknown): Placeholder[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: Placeholder[] = [];
  for (const entry of value) {
    const placeholder = parsePlaceholder(entry);
    if (!placeholder || seen.has(nameKey(placeholder.name))) continue;
    seen.add(nameKey(placeholder.name));
    result.push(placeholder);
    if (result.length >= MAX_PLACEHOLDERS) break;
  }
  return result;
}
