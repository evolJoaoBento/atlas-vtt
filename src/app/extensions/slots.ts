import { invalidatePresentationTargets } from '../services/presentationTargets';
import type {
  DashboardTile, MenuItem, PaletteSection, PanelSpec, SceneTabMenuSection, TokenMenuContext, ToolbarItem, ViewContext,
} from '../../api/types/ui';
import { SlotRegistry } from './SlotRegistry';

/** What extensions add to Atlas's UI, one registry per place; the facade in `src/api/ui` fills them. */
export const toolbarSlot = new SlotRegistry<ToolbarItem>();
export const paletteSlot = new SlotRegistry<PaletteSection>();
export const dashboardSlot = new SlotRegistry<DashboardTile>();
export const viewMenuSlot = new SlotRegistry<(ctx: ViewContext) => MenuItem[]>();
export const tokenMenuSlot = new SlotRegistry<(ctx: TokenMenuContext) => MenuItem[]>();
export const panelSlot = new SlotRegistry<PanelSpec>();
export const sceneTabMenuSlot = new SlotRegistry<SceneTabMenuSection>();

/** Asks every reader to read the callbacks of every slot, and the presentation targets, again. */
export function invalidateSlots(): void {
  for (const slot of [toolbarSlot, paletteSlot, dashboardSlot, viewMenuSlot, tokenMenuSlot, panelSlot, sceneTabMenuSlot]) slot.invalidate();
  invalidatePresentationTargets();
}
