import type { Disposer, ViewId } from './common';
import type { TokenEntity } from './records';

/** What a slot callback is told about the view it is drawn or run in. */
export interface ViewContext {
  viewId: ViewId;
  kind: 'map' | 'remote';
  isPlayerView: boolean;
}

export interface MenuItem {
  label: string;
  /** Lucide name */
  icon?: string;
  onClick?(): void;
  /** A submenu finds itself again by its label when it is read anew: give the submenus among one menu's items distinct labels. */
  submenu?: MenuItem[];
  checked?: boolean;
  disabled?: boolean;
  /**
   * A plain item that leaves its menu open when chosen, for toggles picked several in a row. An open submenu reads its
   * provider again after `ui.invalidate()`, so its checkmarks follow. An item in the menu itself also leaves it open, but
   * its checkmark stays as it was when the menu opened; put toggles picked several in a row in a submenu.
   */
  keepOpen?: boolean;
}

export interface ToolbarItem {
  /** Unique among this extension's toolbar items. */
  id: string;
  /** Lucide name */
  icon: string;
  label: string;
  shortcut?: string;
  /** Where it sits among Atlas's own items, which have 45–100; lower priorities move into "More tools" first. Default 50. */
  priority?: number;
  /** Default ['map']. */
  views?: ReadonlyArray<'map' | 'remote'>;
  /** Draws the button as the one in use, and keeps it in the bar rather than in "More tools". */
  isActive?(ctx: ViewContext): boolean;
  /** A dot (`true`) or a count on the button; `null` shows nothing. */
  badge?(ctx: ViewContext): string | number | true | null;
  onClick(ctx: ViewContext): void;
}

export interface PaletteCommand {
  /** Unique within its section. */
  id: string;
  /** Lucide name */
  icon: string;
  label: string;
  keywords?: string[];
  run(): void;
}

export interface PaletteSection {
  /** Unique among this extension's sections. */
  id: string;
  title: string;
  /** Read again each time the palette draws and after `invalidate()`. */
  commands(ctx: ViewContext): PaletteCommand[];
}

export interface DashboardTile {
  /** Unique among this extension's tiles. */
  id: string;
  /** Lucide name */
  icon: string;
  title: string;
  description: string;
  onClick(): void;
}

/** What a token menu provider is told: the view, the token, and its kind (`tokenKind`, since `kind` is the view's). */
export type TokenMenuContext = ViewContext & { tokenId: string; tokenKind: TokenEntity['kind'] };

export interface PanelSpec {
  /** Unique among this extension's panels. */
  id: string;
  title: string;
  /** Runs when the panel opens in a view; the returned disposer runs when it closes, its view closes, or the panel is disposed. */
  mount(container: HTMLElement, ctx: ViewContext): Disposer;
}

export interface PanelHandle {
  /** Opens the panel in `viewId`, default the active map view; does nothing when there is none. */
  open(viewId?: ViewId): void;
  /** Closes the panel in `viewId`, or in every view when none is given. */
  close(viewId?: ViewId): void;
  toggle(viewId?: ViewId): void;
  isOpen(viewId?: ViewId): boolean;
  /** Closes the panel in every view and removes it; calling it again does nothing. */
  dispose(): void;
}

export interface UiApi {
  addToolbarItem(item: ToolbarItem): Disposer;
  addPaletteSection(section: PaletteSection): Disposer;
  addDashboardTile(tile: DashboardTile): Disposer;
  /** The map's "More options" menu. */
  addViewMenuItems(provider: (ctx: ViewContext) => MenuItem[]): Disposer;
  /** A token's context menu (GM views only); `tokenKind` lets a provider act on characters only. */
  addTokenMenuItems(provider: (ctx: TokenMenuContext) => MenuItem[]): Disposer;
  /** A floating panel in Atlas's panel style; the extension renders into `container` with its own React. */
  addPanel(panel: PanelSpec): PanelHandle;
  /** Re-reads `isActive`, `badge`, palette commands and menu providers now. */
  invalidate(): void;
}
