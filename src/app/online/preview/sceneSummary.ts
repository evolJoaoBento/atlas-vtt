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

export function initiativeLines(initiative: PlayerInitiative | null): string[] {
  if (!initiative || initiative.entries.length === 0) return [];
  const lines = initiative.active ? [`Round ${initiative.round}`] : [];
  for (const entry of initiative.entries) {
    const turn = entry.isActive ? '▶ ' : '';
    // The player window draws a bar with no numbers: the share is all the list says too
    const hp = typeof entry.hpShare === 'number' ? ` · HP ${Math.round(entry.hpShare * 100)}%` : '';
    lines.push(`${turn}${entry.initiative} · ${entry.name ?? 'Unnamed'}${hp}`);
  }
  return lines;
}

/** The players in the session, the away ones marked. */
export function playerLines(players: readonly PresencePlayer[]): string[] {
  return players.map((player) => (player.connected ? player.name : `${player.name} (away)`));
}
