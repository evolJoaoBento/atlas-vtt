import { namesHotkey } from '../../../../keyboard/mapHotkeys'
import { UNDO_BAR_ID, type ToolbarUnitId } from '../../../../toolbar/toolbarCatalog'

/**
 * What the toolbar editor's live region says. Positions count the bar's
 * controls in order, those in "More tools" included and hidden ones not.
 */

export function enteredMessage(): string {
  return 'Editing the toolbar. Drag a tool to move it, or into the tray to hide it. '
    + 'With a tool focused, Alt and the arrow keys move it and Delete hides it. Escape or Done finishes.'
}

export function finishedMessage(): string {
  return 'Done editing the toolbar.'
}

export function positionMessage(label: string, position: number, count: number): string {
  return `${label}, position ${position} of ${count}.`
}

export function movedMessage(label: string, from: number, to: number): string {
  return `${label} moved from position ${from} to ${to}.`
}

/** `hotkey` as `formatHotkey` writes it; an unassigned key is left out. `effect` is what the key does (the undo/redo bar's undoes). */
export function hiddenMessage(label: string, hotkey: string, effect = 'selects it'): string {
  return namesHotkey(hotkey) ? `${label} hidden. ${hotkey} still ${effect}.` : `${label} hidden.`
}

/** What the hotkey of a hidden control or bar still does. */
export function keyEffect(id: ToolbarUnitId): string {
  return id === UNDO_BAR_ID ? 'undoes' : 'selects it'
}

export function shownMessage(label: string, position: number, count: number): string {
  return `${label} is back on the toolbar, position ${position} of ${count}.`
}

/** The undo/redo bar shown again: it has no position among the bar's controls. */
export function shownInPlaceMessage(label: string): string {
  return `${label} is back, left of the toolbar.`
}

/** Alt with the arrow keys on the undo/redo bar, which has no place in the order. */
export function fixedPlaceMessage(label: string): string {
  return `${label} always stays left of the toolbar.`
}

export function refusedMessage(): string {
  return 'The command palette always stays on the toolbar.'
}

export function resetMessage(undone: boolean): string {
  return undone ? 'Reset undone.' : 'Toolbar reset.'
}

/**
 * A drag let go outside the bar and the tray, or broken off: `position` is
 * null for a tool from the tray, 'own' for the undo/redo bar from its place.
 */
export function cancelledMessage(label: string, position: number | null | 'own'): string {
  if (position === null) return `Move cancelled. ${label} is back in hidden tools.`
  return position === 'own' ? `Move cancelled. ${label} is back in its place.` : `Move cancelled. ${label} is back at position ${position}.`
}
