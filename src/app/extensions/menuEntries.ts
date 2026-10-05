import type { ContextMenuEntry } from '../react/root/ContextMenuContext';
import type { MenuItem, TokenMenuContext, ViewContext } from '../../api/types/ui';
import type { TokenEntity } from '../types';
import { safely, type SlotRegistry } from './SlotRegistry';
import { tokenMenuSlot } from './slots';

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

/**
 * Atlas's menu entries for an extension's items: an item with `submenu` becomes a submenu (recursively; `checked` and
 * `disabled` apply to plain items only), and an item without a label, or a submenu with nothing in it, is left out.
 * Clicks run guarded, so a menu never breaks on an extension.
 */
export function menuEntriesOf(owner: string, items: readonly MenuItem[]): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  // An extension may hand over anything: read it as a list of maybe-items.
  const list: ReadonlyArray<MenuItem | null | undefined> = Array.isArray(items) ? (items as ReadonlyArray<MenuItem | null | undefined>) : [];
  for (const item of list) {
    if (!item || typeof item.label !== 'string' || item.label === '') continue;
    const icon = typeof item.icon === 'string' && item.icon !== '' ? { icon: item.icon } : {};
    if (item.submenu !== undefined) {
      const children = menuEntriesOf(owner, item.submenu);
      if (children.length > 0) entries.push({ type: 'submenu', label: item.label, children, ...icon });
      continue;
    }
    entries.push({
      type: 'item',
      label: item.label,
      onClick: clickOf(owner, item),
      ...icon,
      ...(item.checked !== undefined ? { checked: item.checked === true } : {}),
      ...(item.disabled !== undefined ? { disabled: item.disabled === true } : {}),
    });
  }
  return entries;
}

/** The entries every provider registered in `slot` gives for `ctx`, in the order they were added; a provider that throws gives none. */
export function providedMenuEntries<C>(slot: SlotRegistry<(ctx: C) => MenuItem[]>, slotName: string, ctx: C): ContextMenuEntry[] {
  return slot.list().flatMap(({ owner, item: provider }) =>
    menuEntriesOf(owner, safely(owner, slotName, () => [...provider(ctx)], [])));
}

/** What extensions add to a token's context menu, for a GM view; a player view is never asked. */
export function tokenMenuEntries(ctx: ViewContext, token: Pick<TokenEntity, 'id' | 'kind'>): ContextMenuEntry[] {
  if (ctx.isPlayerView) return [];
  const tokenCtx: TokenMenuContext = Object.freeze({ ...ctx, tokenId: token.id, tokenKind: token.kind });
  return providedMenuEntries(tokenMenuSlot, 'token menu items', tokenCtx);
}
