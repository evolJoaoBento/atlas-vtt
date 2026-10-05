import { formatList, getLocale, TRANSLATIONS, type MessageKey } from '../../../i18n';

/**
 * `items` joined in the language the sentence `key` is shown in: the active language where it
 * translates the sentence, else English, as `t` falls back. Sharing's texts have no translation
 * yet, so a Russian Atlas would otherwise write "Shared with: Ana и Ben".
 */
export function listFor(key: MessageKey, items: readonly string[]): string {
  if (TRANSLATIONS[getLocale()]?.[key] !== undefined) return formatList(items);
  return new Intl.ListFormat('en', { type: 'conjunction' }).format(items);
}
