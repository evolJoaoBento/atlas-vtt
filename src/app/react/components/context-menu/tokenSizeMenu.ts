import type { ContextMenuEntry } from './AtlasContextMenu';
import { tokenSizeOptions } from '../../../i18n/sharedTexts';
import { t } from '../../../i18n';

/** "Size" submenu shared by the map token menu and the asset manager; `currentSize` undefined means 1×1. */
export function tokenSizeSubmenu(currentSize: number | undefined, onSelect: (size: number) => void): ContextMenuEntry {
  const children: ContextMenuEntry[] = tokenSizeOptions().map(option => ({
    type: 'item',
    label: option.label,
    checked: (currentSize ?? 1) === option.size,
    onClick: () => onSelect(option.size),
  }));
  return { type: 'submenu', label: t('menu.size'), icon: 'scaling', children };
}
