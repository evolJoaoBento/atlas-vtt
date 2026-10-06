import type { ContextMenuEntry } from '../react/root/ContextMenuContext';
import type { MenuItem, SceneTabMenuContext, SceneTabMenuSection, TokenMenuContext, ViewContext } from '../../api/types/ui';
import type { TokenEntity } from '../types';
import { safely, type SlotEntry, type SlotRegistry } from './SlotRegistry';
import { sceneTabMenuSlot, tokenMenuSlot } from './slots';

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

/** Runs an extension's click; a throw or a rejected promise is logged, never raised into the menu. */
function clickOf(owner: string, item: MenuItem): () => unknown {
  const slot = `menu item "${item.label}"`;
  return () => {
    try {
      const result: unknown = item.onClick?.();
      if (isThenable(result)) {
        return Promise.resolve(result).then(() => undefined, (error: unknown) => { console.error(`[Atlas API] ${owner}: ${slot} failed:`, error); });
      }
    } catch (error) {
      console.error(`[Atlas API] ${owner}: ${slot} failed:`, error);
    }
    return undefined;
  };
}

/** How an open submenu reads its items again: `read` runs the provider anew, `subscribe` says when to. */
export interface LiveMenu {
  read: () => readonly MenuItem[];
  subscribe: (onChange: () => void) => () => void;
}

// An extension may hand over anything: read it as a list of maybe-items.
function itemsOf(items: unknown): ReadonlyArray<MenuItem | null | undefined> {
  return Array.isArray(items) ? (items as ReadonlyArray<MenuItem | null | undefined>) : [];
}

/** The items of the first submenu labelled `label` among `items`; none when the provider no longer gives it. */
function submenuOf(items: readonly MenuItem[], label: string): readonly MenuItem[] {
  const found = itemsOf(items).find((item) => item?.label === label && item.submenu !== undefined);
  return found?.submenu ?? [];
}

/**
 * Atlas's menu entries for an extension's items: an item with `submenu` becomes a submenu (recursively; `checked`,
 * `disabled` and `keepOpen` apply to plain items only), and an item without a label, or a submenu with nothing in it,
 * is left out. Clicks run guarded, so a menu never breaks on an extension. With `live`, an open submenu reads its
 * items again whenever `live.subscribe` reports a change, finding itself by its labels (the first of a label).
 */
export function menuEntriesOf(owner: string, items: readonly MenuItem[], live?: LiveMenu): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  for (const item of itemsOf(items)) {
    if (!item || typeof item.label !== 'string' || item.label === '') continue;
    const icon = typeof item.icon === 'string' && item.icon !== '' ? { icon: item.icon } : {};
    if (item.submenu !== undefined) {
      const label = item.label;
      const sub: LiveMenu | undefined = live && { read: () => submenuOf(live.read(), label), subscribe: live.subscribe };
      const children = menuEntriesOf(owner, item.submenu, sub);
      if (children.length === 0) continue;
      entries.push(sub
        ? { type: 'submenu', label, children: () => menuEntriesOf(owner, sub.read(), sub), subscribe: sub.subscribe, ...icon }
        : { type: 'submenu', label, children, ...icon });
      continue;
    }
    entries.push({
      type: 'item',
      label: item.label,
      onClick: clickOf(owner, item),
      ...icon,
      ...(item.checked !== undefined ? { checked: item.checked === true } : {}),
      ...(item.disabled !== undefined ? { disabled: item.disabled === true } : {}),
      ...(item.keepOpen === true ? { keepOpen: true } : {}),
    });
  }
  return entries;
}

/**
 * The entries every provider registered in `slot` gives for `ctx`, in the order they were added; a provider that throws
 * gives none. An open submenu runs its provider again on every change of `slot` (`ui.invalidate()` among them), and
 * shows nothing once the provider is removed.
 */
export function providedMenuEntries<C>(slot: SlotRegistry<(ctx: C) => MenuItem[]>, slotName: string, ctx: C): ContextMenuEntry[] {
  const subscribe = (onChange: () => void): (() => void) => slot.subscribe(onChange);
  return slot.list().flatMap((entry) => {
    const read = (): readonly MenuItem[] => (slot.list().includes(entry)
      ? safely(entry.owner, slotName, () => [...entry.item(ctx)], [])
      : []);
    return menuEntriesOf(entry.owner, read(), { read, subscribe });
  });
}

/** What extensions add to a token's context menu, for a GM view; a player view is never asked. */
export function tokenMenuEntries(ctx: ViewContext, token: Pick<TokenEntity, 'id' | 'kind'>): ContextMenuEntry[] {
  if (ctx.isPlayerView) return [];
  const tokenCtx: TokenMenuContext = Object.freeze({ ...ctx, tokenId: token.id, tokenKind: token.kind });
  return providedMenuEntries(tokenMenuSlot, 'token menu items', tokenCtx);
}

/** Sections whose `items` threw already: the failure is logged once, not on every read of an open menu. */
const failedSections = new WeakSet<SceneTabMenuSection>();

/** A section's items for `ctx`; none once the section is removed, and none (logged once) when `items` throws. */
function sectionItems({ owner, item: section }: SlotEntry<SceneTabMenuSection>, ctx: SceneTabMenuContext): readonly MenuItem[] {
  if (!sceneTabMenuSlot.list().some((entry) => entry.item === section)) return [];
  try {
    return [...itemsOf(section.items(ctx))].filter((item): item is MenuItem => item != null);
  } catch (error) {
    if (!failedSections.has(section)) {
      failedSections.add(section);
      console.error(`[Atlas API] ui.addSceneTabMenuSection: ${owner}'s section "${section.heading}" failed:`, error);
    }
    return [];
  }
}

/**
 * What extensions add to a scene tab's eye menu for `ctx`, in the order they were added: for each section with items,
 * a separator, its heading as a label row, then its items. Read anew on every call; an open submenu in a section
 * follows `ui.invalidate()` as in the other menus.
 */
export function sceneTabMenuEntries(ctx: SceneTabMenuContext): ContextMenuEntry[] {
  const subscribe = (onChange: () => void): (() => void) => sceneTabMenuSlot.subscribe(onChange);
  return sceneTabMenuSlot.list().flatMap((entry) => {
    const read = (): readonly MenuItem[] => sectionItems(entry, ctx);
    const items = menuEntriesOf(entry.owner, read(), { read, subscribe });
    return items.length === 0 ? [] : [{ type: 'separator' } as const, { type: 'label', text: entry.item.heading } as const, ...items];
  });
}
