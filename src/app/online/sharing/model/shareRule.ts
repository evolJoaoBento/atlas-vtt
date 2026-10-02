/**
 * The `atlas-share` property: who a note is shared with. `public` is everyone in a session
 * with me, `private` (and no property) nobody, names only those people, `except Name`
 * everyone but them. `private` wins over everything and `except` over a name. Commas separate
 * names in a text value too. The property itself is never sent.
 */
import type { NameResolver } from './audience';

export const SHARE_PROPERTY = 'atlas-share';

export interface ShareRule {
  /** Set only by an explicit `private`. */
  private: boolean;
  public: boolean;
  only: string[];
  except: string[];
}

/** What the Share with… dialog chose: names for notes, person keys for maps. */
export interface ShareChoice {
  everyone: boolean;
  people: string[];
  except: string[];
}

function entriesOf(value: unknown): string[] {
  const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  return values.flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : [])).map((entry) => entry.trim()).filter(Boolean);
}

export function parseShareRule(value: unknown): ShareRule {
  const rule: ShareRule = { private: false, public: false, only: [], except: [] };
  for (const entry of entriesOf(value)) {
    const lower = entry.toLowerCase();
    if (lower === 'private') rule.private = true;
    else if (lower === 'public') rule.public = true;
    else if (/^except\s+/i.test(entry)) rule.except.push(entry.replace(/^except\s+/i, '').trim());
    else rule.only.push(entry.replace(/^only\s+/i, '').trim());
  }
  return rule;
}

/** The property value for a choice; null removes the property (nobody). */
export function formatShareRule(choice: ShareChoice): string | string[] | null {
  if (choice.everyone) return choice.except.length ? ['public', ...choice.except.map((name) => `except ${name}`)] : 'public';
  return choice.people.length ? [...choice.people] : null;
}

/** Names in the rule that are not in the people list, sorted. */
export function unknownRuleNames(rule: ShareRule, people: NameResolver): string[] {
  return [...new Set([...rule.only, ...rule.except].filter((name) => !people.byName(name)))].sort();
}
