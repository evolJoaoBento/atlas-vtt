import React from 'react';
import { ToolButton } from '../packages/components/primitives/ToolButton';
import type { ResponsiveToolbarItem } from '../packages/components/toolbar/toolbarTypes';
import type { ToolbarItem, ViewContext } from '../../api/types/ui';
import { obsidianIconComponent } from '../react/components/ObsidianIcon';
import { safely, type SlotEntry } from './SlotRegistry';
import { toolbarSlot } from './slots';
import { useSlot } from './useSlot';
import { viewContextOf } from './viewContext';

/** Between Atlas's own priorities, which run from 45 to 100. */
export const DEFAULT_EXTENSION_PRIORITY = 50;

function ToolBadge({ badge, label }: { badge: string | number | true; label: string }): React.ReactElement {
  if (badge === true) return <span className="atlas-ext-tool__dot" aria-hidden="true" />;
  return (
    <span className="atlas-ext-tool__badge">
      <span aria-hidden="true">{badge}</span>
      <span className="atlas-ext-tool__hidden-text">{`${label}: ${badge}`}</span>
    </span>
  );
}

/** A badge worth drawing: `null`, an empty string and anything else an extension returns by mistake draw nothing. */
function drawableBadge(value: unknown): string | number | true | null {
  if (value === true) return true;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '') return value;
  return null;
}

/**
 * One registered item as a toolbar control: a `ToolButton` with a dot or count on it, a "More tools" entry, and a pin while it
 * is active (a control whose panel hangs from it stays in the bar). Every callback of the extension runs guarded.
 */
export function extensionToolbarItem({ owner, item }: SlotEntry<ToolbarItem>, ctx: ViewContext): ResponsiveToolbarItem {
  const slot = `toolbar item "${item.id}"`;
  const active = safely(owner, `${slot} isActive`, () => item.isActive?.(ctx) === true, false);
  const badge = safely(owner, `${slot} badge`, () => drawableBadge(item.badge?.(ctx)), null);
  const select = (): void => safely(owner, `${slot} onClick`, () => { item.onClick(ctx); }, undefined);
  const Icon = obsidianIconComponent(item.icon);
  const priority = Number.isFinite(item.priority) ? item.priority as number : DEFAULT_EXTENSION_PRIORITY;
  return {
    // Namespaced: ids are React keys and the toolbar's fit keys, and must not meet Atlas's own ('move', 'dice', ...).
    id: `ext:${owner}:${item.id}`,
    priority,
    pinned: active,
    element: (
      <div className="atlas-ext-tool">
        <ToolButton icon={Icon} label={item.label} isActive={active} onClick={select} {...(item.shortcut ? { shortcut: item.shortcut } : {})} />
        {badge !== null && <ToolBadge badge={badge} label={item.label} />}
      </div>
    ),
    menuEntry: { icon: Icon, label: item.label, isActive: active, onSelect: select, ...(item.shortcut ? { shortcut: item.shortcut } : {}) },
  };
}

/** The registered toolbar items that belong in this view, to be placed among Atlas's own. None in a player view. */
export function useExtensionToolbarItems(
  viewId: string | undefined,
  store: { getState(): { isPlayerView?: boolean } },
  isActualPlayerView: boolean,
): ResponsiveToolbarItem[] {
  const entries = useSlot(toolbarSlot);
  if (!viewId || isActualPlayerView) return [];
  const ctx = viewContextOf({ viewId }, store);
  if (ctx.isPlayerView) return [];
  return entries
    .filter(({ item }) => (item.views ?? ['map']).includes(ctx.kind))
    .map((entry) => extensionToolbarItem(entry, ctx));
}
