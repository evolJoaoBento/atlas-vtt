/**
 * The join page's stand-in for Atlas's translations (`src/app/i18n`), which read Obsidian's language.
 * A few Atlas modules the page shares name their labels through `t()`: laser colours, map icons and
 * token sizes. The page speaks English and carries only those texts; `tests/unit/online/pageImports.test.ts`
 * checks that no other shared module reaches the translations, and that every key they use is here.
 */
import { laser } from '../../src/app/i18n/locales/en/laser';
import { mapIcon } from '../../src/app/i18n/locales/en/mapIcon';
import { token } from '../../src/app/i18n/locales/en/token';
import type { Message, MessageKey, MessageValues } from '../../src/app/i18n/types';

export type { MessageKey } from '../../src/app/i18n/types';

export const PAGE_TEXTS: Readonly<Record<string, Message>> = { ...laser, ...mapIcon, ...token };

const plurals = new Intl.PluralRules('en');

export function t(key: MessageKey, values?: MessageValues): string {
  const message = PAGE_TEXTS[key];
  if (message === undefined) throw new Error(`The join page has no text for ${key}`);
  const count = values?.count;
  const text = typeof message === 'string' ? message : (typeof count === 'number' ? message[plurals.select(count)] : undefined) ?? message.other;
  return values ? text.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder)) : text;
}

export function getLocale(): string {
  return 'en';
}

export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat('en', { type: 'conjunction' }).format(items);
}
