import type React from "react"
import type { DiceTool } from "../../../tools/DiceTool"
import type { TrayPool } from "../../../react/components/dice/diceTrayPool"
import type { MapHotkeyId } from "../../../keyboard/mapHotkeys"
import type { Tool } from "./toolFaces"
import type { ToolGroupControls } from "./ToolGroup"

/** Tool groups whose options menu is open; only one at a time. */
export type ToolMenu = 'move' | 'fog' | 'draw' | 'text' | 'measure' | 'wall'

/**
 * What MainToolbar hands every control's item builder. Gates (player view,
 * experimental features, build flags) live in the catalog and are applied
 * before a builder is asked.
 */
export interface ToolbarContext {
  activeTool: Tool
  selectTool: (tool: Tool) => void
  hotkeyLabel: (id: MapHotkeyId) => string
  openMenu: ToolMenu | null
  groupControls: (menu: ToolMenu) => ToolGroupControls
  dice: {
    open: boolean; toggle: () => void; tool: DiceTool | null; buttonRef: React.RefObject<HTMLDivElement | null>
    /** The Online scene's tray: rolls go to the GM (a refusal's text, or null when sent), at most `maxDice` dice. */
    online?: { onRoll: (pool: TrayPool, modifier: number) => string | null; maxDice: number }
  }
  loot: { open: boolean; setOpen: (open: boolean) => void }
  assets: { open: boolean; toggle: () => void }
  palette: { open: boolean; setOpen: (open: boolean) => void }
}
