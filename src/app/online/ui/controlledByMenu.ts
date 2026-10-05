/**
 * "Controlled by" in a character token's context menu while an online session runs:
 * every admitted player as a checkbox. Assignments live in the session's
 * `TokenControl`, never in token data. Read through `onlineSessionStore`, so the token
 * renderer does not import the session service (and PeerJS with it).
 */
import type { ContextMenuEntry } from '../../react/root/ContextMenuContext';
import type { TokenControl } from '../control/TokenControl';
import type { SessionPlayer } from '../GmSession';
import { onlineSessionStore } from '../onlineSessionStore';
import { t } from '../../i18n';

export const CONTROLLED_BY_LABEL = t('online.controlledBy');
export const NO_PLAYERS_LABEL = t('online.noPlayersConnected');

/** The submenu for `tokenId`; null while no session is hosted. */
export function controlledBySubmenu(tokenId: string): ContextMenuEntry | null {
  const { status, tokenControl } = onlineSessionStore.getState();
  if (status !== 'hosting' || !tokenControl) return null;
  return {
    type: 'submenu',
    label: CONTROLLED_BY_LABEL,
    icon: 'users',
    children: () => playerEntries(onlineSessionStore.getState().tokenControl, onlineSessionStore.getState().players, tokenId),
    // An open submenu follows assignments made elsewhere and players joining or leaving.
    subscribe: (onChange) => {
      const stopControl = tokenControl.onChange(() => onChange());
      const stopStore = onlineSessionStore.subscribe(() => onChange());
      return () => {
        stopControl();
        stopStore();
      };
    },
  };
}

function playerEntries(control: TokenControl | null, players: readonly SessionPlayer[], tokenId: string): ContextMenuEntry[] {
  const admitted = control ? players.filter((player) => player.status === 'admitted') : [];
  if (!control || admitted.length === 0) {
    return [{ type: 'item', label: NO_PLAYERS_LABEL, disabled: true, onClick: () => undefined }];
  }
  return admitted.map((player): ContextMenuEntry => ({
    type: 'item',
    label: player.name,
    checked: control.controls(player.playerId, tokenId),
    keepOpen: true,
    onClick: () => control.set(tokenId, player.playerId, !control.controls(player.playerId, tokenId)),
  }));
}
