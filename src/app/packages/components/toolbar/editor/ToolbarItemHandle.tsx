import React, { useId } from 'react'
import { isHideableToolbarControl, isToolbarControlId, toolbarUnit, type ToolbarUnitId } from '../../../../toolbar/toolbarCatalog'
import { useToolbarEdit, type ToolbarHandleGroup } from './toolbarEditContext'
import { useToolbarEditMenu } from './useToolbarEditMenu'
import { useToolbarKeyboard } from './useToolbarKeyboard'

function keyHint(id: ToolbarUnitId, group: ToolbarHandleGroup): string {
  if (group === 'tray') return 'Enter puts it back on the toolbar.'
  // The undo/redo bar keeps its own place.
  if (!isToolbarControlId(id)) return 'Delete hides it.'
  return isHideableToolbarControl(id) ? 'Alt with the arrow keys moves it, Delete hides it.' : 'Alt with the arrow keys moves it.'
}

interface ToolbarItemHandleProps {
  id: ToolbarUnitId
  group: ToolbarHandleGroup
  /** 0 for the handle that holds its group's Tab stop, else -1. */
  tabIndex: number
}

/**
 * What the pointer and the keyboard reach of a tool (or of the undo/redo
 * bar) while the toolbar editor is open: a button laid under the tool's inert
 * content (over the undo/redo bar), named after the catalog. A press may become a drag; right-click opens the editor's menu
 * (never during a drag); a plain click does nothing.
 */
export function ToolbarItemHandle({ id, group, tabIndex }: ToolbarItemHandleProps): React.ReactElement {
  const edit = useToolbarEdit()
  const openMenu = useToolbarEditMenu()
  const onKeyDown = useToolbarKeyboard(id, group)
  const labelId = useId()
  const descriptionId = useId()
  const control = toolbarUnit(id)

  return (
    <button
      type="button"
      className="atlas-toolbar-handle"
      data-control={id}
      tabIndex={tabIndex}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      onKeyDown={onKeyDown}
      onFocus={() => edit?.setCurrent(group, id)}
      onPointerDown={(event) => edit?.press(event, id, group)}
      onContextMenu={(event) => {
        event.preventDefault()
        if (edit?.allowContextMenu() === false) return
        openMenu(id, group, { x: event.clientX, y: event.clientY })
      }}
    >
      <span id={labelId} hidden>{control.label}</span>
      <span id={descriptionId} hidden>{`${control.description} ${keyHint(id, group)}`}</span>
    </button>
  )
}
