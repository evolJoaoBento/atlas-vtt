/** Widgets and initiative as the lines the join page lists beside its preview. */
import { formatTimerTime } from '../../utils/timerWidget';
import type { PresencePlayer } from '../protocol';
import type { PlayerInitiative, PlayerWidget } from '../scene/sceneTypes';

export function widgetLines(widgets: readonly PlayerWidget[]): string[] {
  return widgets.map((widget) => {
    const value = widget.type === 'timer' ? formatTimerTime(widget.value) : String(widget.value);
    return `${widget.label || widget.type}: ${value}`;
  });
}

/** A list row: its text, and how full the bar after it is (0 to 1) where the player window draws one. */
export interface ListRow {
  text: string;
  share?: number;
}

/** The initiative list's rows. The player window draws a bar after the name and no numbers, so the share is not printed. */
export function initiativeLines(initiative: PlayerInitiative | null): ListRow[] {
  if (!initiative || initiative.entries.length === 0) return [];
  const lines: ListRow[] = initiative.active ? [{ text: `Round ${initiative.round}` }] : [];
  for (const entry of initiative.entries) {
    const turn = entry.isActive ? '▶ ' : '';
    lines.push({ text: `${turn}${entry.initiative} · ${entry.name ?? 'Unnamed'}`, ...(typeof entry.hpShare === 'number' ? { share: entry.hpShare } : {}) });
  }
  return lines;
}

/** The players in the session, the away ones marked. */
export function playerLines(players: readonly PresencePlayer[]): string[] {
  return players.map((player) => (player.connected ? player.name : `${player.name} (away)`));
}
