/**
 * Atlas's translations of texts that live in modules the `@atlas-vtt/shared` packages carry. Those modules stay
 * free of the translation mechanism, which reads Obsidian's language: a player's page imports them in a browser
 * without Obsidian, and keeps their English. Atlas's own UI reads the texts through here.
 */
import { t, type MessageKey } from './index';
import { TOKEN_SIZE_OPTIONS } from '../pixi/token-renderer/tokenSizing';
import { LASER_COLOR_SWATCHES } from '../tools/laserPointerSettings';
import { MAP_ICON_LABELS } from '../pixi/mapIcons';
import { resetLabel } from '../resources/resourceValues';
import type { ResourceDefinition } from '../resources/resourceTypes';

const TOKEN_SIZE_KEYS: Readonly<Record<number, MessageKey>> = {
  1: 'token.size.medium', 1.5: 'token.size.large', 2: 'token.size.huge', 2.5: 'token.size.gargantuan',
};

const LASER_COLOR_KEYS: Readonly<Record<string, MessageKey>> = {
  '#ff0059': 'laser.color.red', '#ff9f2e': 'laser.color.orange', '#fff133': 'laser.color.yellow', '#66ffa9': 'laser.color.mint',
  '#00a9ff': 'laser.color.sky', '#3d6bff': 'laser.color.blue', '#e85aa8': 'laser.color.pink', '#ffffff': 'laser.color.white',
};

const MAP_ICON_KEYS: Readonly<Record<string, MessageKey>> = {
  'door-open': 'mapIcon.doorOpen', 'door-closed': 'mapIcon.doorClosed', 'lock': 'mapIcon.lock', 'key-round': 'mapIcon.key',
  'triangle-alert': 'mapIcon.trap', 'skull': 'mapIcon.danger', 'flame': 'mapIcon.fire', 'package': 'mapIcon.loot',
  'gem': 'mapIcon.treasure', 'swords': 'mapIcon.combat', 'footprints': 'mapIcon.tracks', 'circle-x': 'mapIcon.blocked',
};

const translated = (key: MessageKey | undefined, english: string): string => (key ? t(key) : english);

/** `TOKEN_SIZE_OPTIONS` in Atlas's language. */
export function tokenSizeOptions(): Array<{ label: string; size: number }> {
  return TOKEN_SIZE_OPTIONS.map((option) => ({ ...option, label: translated(TOKEN_SIZE_KEYS[option.size], option.label) }));
}

/** `LASER_COLOR_SWATCHES` in Atlas's language. */
export function laserColorSwatches(): Array<{ value: string; label: string }> {
  return LASER_COLOR_SWATCHES.map((swatch) => ({ value: swatch.value, label: translated(LASER_COLOR_KEYS[swatch.value], swatch.label) }));
}

/** `LASER_COLOR_HINT` in Atlas's language. */
export const laserColorHint = (): string => t('laser.colorHint');

/** `MAP_ICON_LABELS` in Atlas's language. */
export function mapIconLabels(): Record<string, string> {
  return Object.fromEntries(Object.entries(MAP_ICON_LABELS).map(([icon, label]) => [icon, translated(MAP_ICON_KEYS[icon], label)]));
}

/** `resetLabel` in Atlas's language; the wording for resources beyond the first two bars has no translation yet. */
export function tokenResetLabel(definitions: readonly ResourceDefinition[]): string {
  const english = resetLabel(definitions);
  return english === resetLabel([]) ? t('token.reset') : english;
}
