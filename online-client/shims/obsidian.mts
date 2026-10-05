/**
 * What the join page has of the `obsidian` module: nothing but the language. Upstream's
 * translations (`src/app/i18n`) read it when they load, and a few Atlas modules the page
 * shares (laser colours, map icons, token sizes) name their labels through them. The page
 * speaks English.
 */
export function getLanguage(): string {
  return 'en';
}
