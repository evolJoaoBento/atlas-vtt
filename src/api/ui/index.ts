import { closePanel, closePanelEverywhere, isPanelOpen, openPanel } from '../../app/extensions/panelState';
import type { SlotRegistry } from '../../app/extensions/SlotRegistry';
import {
  dashboardSlot, invalidateSlots, paletteSlot, panelSlot, tokenMenuSlot, toolbarSlot, viewMenuSlot,
} from '../../app/extensions/slots';
import type { ExtensionScope } from '../extension';
import type { ViewTracker } from '../viewTracker';
import type { Disposer, ViewId } from '../types/common';
import type {
  DashboardTile, MenuItem, PaletteSection, PanelHandle, PanelSpec, TokenMenuContext, ToolbarItem, UiApi, ViewContext,
} from '../types/ui';

const VIEW_KINDS: readonly string[] = ['map', 'remote'];

function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** Throws, naming the call and the field, unless every field of `spec` has its kind. A programmer error, like `lasers.show`'s. */
function check(call: string, spec: unknown, fields: Record<string, 'text' | 'string' | 'function'>, optional: Record<string, 'text' | 'function' | 'number'> = {}): void {
  if (typeof spec !== 'object' || spec === null) throw new Error(`[Atlas API] ${call} needs an object.`);
  const record = spec as Record<string, unknown>;
  for (const [field, kind] of Object.entries(fields)) {
    const value = record[field];
    const ok = kind === 'function' ? typeof value === 'function' : kind === 'string' ? typeof value === 'string' : isText(value);
    if (!ok) throw new Error(`[Atlas API] ${call}: "${field}" must be ${kind === 'function' ? 'a function' : kind === 'string' ? 'a string' : 'a non-empty string'}.`);
  }
  for (const [field, kind] of Object.entries(optional)) {
    const value = record[field];
    if (value === undefined) continue;
    const ok = kind === 'function' ? typeof value === 'function' : kind === 'number' ? typeof value === 'number' && Number.isFinite(value) : isText(value);
    if (!ok) throw new Error(`[Atlas API] ${call}: "${field}" must be ${kind === 'function' ? 'a function' : kind === 'number' ? 'a number' : 'a non-empty string'} when given.`);
  }
}

/** One id per extension and slot: ids become React keys and the toolbar's fit keys. */
function assertNew<T extends { id: string }>(call: string, slot: SlotRegistry<T>, owner: string, id: string): void {
  if (slot.list().some((entry) => entry.owner === owner && entry.item.id === id)) {
    throw new Error(`[Atlas API] ${call}: "${id}" is already registered by this extension.`);
  }
}

/** The extension's registrations: every `add*` registers in the slot and hands its removal to the scope's disposers. */
export function uiApi(scope: ExtensionScope, views: ViewTracker): UiApi {
  const register = <T>(slot: SlotRegistry<T>, item: T): Disposer => scope.disposers.add(slot.add(scope.id, item));

  function addPanel(spec: PanelSpec): PanelHandle {
    check('ui.addPanel', spec, { id: 'text', title: 'text', mount: 'function' });
    assertNew('ui.addPanel', panelSlot, scope.id, spec.id);
    const panel: PanelSpec = Object.freeze({ id: spec.id, title: spec.title, mount: (container: HTMLElement, ctx: ViewContext): Disposer => spec.mount(container, ctx) });
    let alive = true;
    const remove = panelSlot.add(scope.id, panel);
    // Disposing closes the panel in every view, then removes it; unloading the extension does the same.
    const dispose = scope.disposers.add(() => {
      alive = false;
      closePanelEverywhere(panel);
      remove();
    });
    /** The view a call acts on: the one named, or the active map view; null for one that is not open. */
    const target = (viewId?: ViewId): ViewId | null => {
      if (!alive) return null;
      return (viewId === undefined ? views.activeView() : views.view(viewId))?.viewId ?? null;
    };
    return Object.freeze({
      open: (viewId?: ViewId): void => { const id = target(viewId); if (id) openPanel(panel, id); },
      close: (): void => { const id = target(); if (id) closePanel(panel, id); },
      toggle: (viewId?: ViewId): void => {
        const id = target(viewId);
        if (!id) return;
        if (isPanelOpen(panel, id)) closePanel(panel, id);
        else openPanel(panel, id);
      },
      isOpen: (viewId?: ViewId): boolean => { const id = target(viewId); return id !== null && isPanelOpen(panel, id); },
      dispose,
    });
  }

  return Object.freeze({
    addToolbarItem: (item: ToolbarItem): Disposer => {
      check('ui.addToolbarItem', item, { id: 'text', icon: 'text', label: 'text', onClick: 'function' },
        { shortcut: 'text', priority: 'number', isActive: 'function', badge: 'function' });
      const kinds: unknown = item.views;
      if (kinds !== undefined && !(Array.isArray(kinds) && (kinds as unknown[]).every((kind) => typeof kind === 'string' && VIEW_KINDS.includes(kind)))) {
        throw new Error('[Atlas API] ui.addToolbarItem: "views" must list \'map\' and \'remote\'.');
      }
      assertNew('ui.addToolbarItem', toolbarSlot, scope.id, item.id);
      return register(toolbarSlot, Object.freeze({ ...item, ...(item.views ? { views: Object.freeze([...item.views]) } : {}) }));
    },
    addPaletteSection: (section: PaletteSection): Disposer => {
      check('ui.addPaletteSection', section, { id: 'text', title: 'text', commands: 'function' });
      assertNew('ui.addPaletteSection', paletteSlot, scope.id, section.id);
      return register(paletteSlot, Object.freeze({ ...section }));
    },
    addDashboardTile: (tile: DashboardTile): Disposer => {
      check('ui.addDashboardTile', tile, { id: 'text', icon: 'text', title: 'text', description: 'string', onClick: 'function' });
      assertNew('ui.addDashboardTile', dashboardSlot, scope.id, tile.id);
      return register(dashboardSlot, Object.freeze({ ...tile }));
    },
    addViewMenuItems: (provider: (ctx: ViewContext) => MenuItem[]): Disposer => {
      if (typeof provider !== 'function') throw new Error('[Atlas API] ui.addViewMenuItems needs a function.');
      return register(viewMenuSlot, provider);
    },
    addTokenMenuItems: (provider: (ctx: TokenMenuContext) => MenuItem[]): Disposer => {
      if (typeof provider !== 'function') throw new Error('[Atlas API] ui.addTokenMenuItems needs a function.');
      return register(tokenMenuSlot, provider);
    },
    addPanel,
    invalidate: (): void => invalidateSlots(),
  });
}
