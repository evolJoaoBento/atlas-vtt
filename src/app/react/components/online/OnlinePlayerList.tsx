import React from 'react';
import { Gem, X } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { TokenControl } from '../../../online/control/TokenControl';
import type { SessionPlayer } from '../../../online/GmSession';
import type { OnlineSessionService } from '../../../online/OnlineSessionService';
import { OBSIDIAN_PLAYER_LABEL, REMOVE_PLAYER_LABEL } from '../../../online/ui/onlineCopy';
import { usePresentedSceneSummary, useTokenControlVersion } from './useOnlineState';

interface OnlinePlayerListProps {
  players: readonly SessionPlayer[];
  control: TokenControl | null;
  service: Pick<OnlineSessionService, 'allow' | 'deny' | 'kick'>;
}

/** Marks a player who joined from Atlas in Obsidian. */
function ObsidianMark(): React.ReactElement {
  return (
    <LabelTooltip label={OBSIDIAN_PLAYER_LABEL}>
      <span className="atlas-online-panel__client" role="img" aria-label={OBSIDIAN_PLAYER_LABEL}><Gem aria-hidden="true" /></span>
    </LabelTooltip>
  );
}

/**
 * Players waiting to join, and the players in the session with the tokens they control.
 * Tokens are given on the map, with a token's "Controlled by" menu.
 */
export function OnlinePlayerList({ players, control, service }: OnlinePlayerListProps): React.ReactElement {
  const scene = usePresentedSceneSummary();
  useTokenControlVersion(control);

  const waiting = players.filter((player) => player.status === 'pending');
  const joined = players.filter((player) => player.status !== 'pending');
  const names = new Map(scene.characters.map((character) => [character.id, character.name]));

  return (
    <>
      {waiting.length > 0 && (
        <section className="atlas-online-panel__section" aria-label="Waiting to join">
          <h3 className="atlas-online-panel__heading">Waiting to join</h3>
          <ul className="atlas-online-panel__players">
            {waiting.map((player) => (
              <li key={player.playerId} className="atlas-online-panel__player" aria-label={player.name}>
                <div className="atlas-online-panel__player-row">
                  <span className="atlas-online-panel__name">{player.name}</span>
                  {player.client === 'obsidian' && <ObsidianMark />}
                  <Button variant="default" size="sm" onClick={() => service.allow(player.playerId)}>Allow</Button>
                  <Button variant="outline" size="sm" onClick={() => service.deny(player.playerId)}>Deny</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="atlas-online-panel__section" aria-label="Players">
        <h3 className="atlas-online-panel__heading">Players</h3>
        {joined.length === 0 ? (
          <p className="atlas-online-panel__help">No players yet. Share the link to invite them.</p>
        ) : (
          <ul className="atlas-online-panel__players">
            {joined.map((player) => {
              const tokens = control
                ? control.tokensOf(player.playerId).flatMap((id) => {
                  const name = names.get(id);
                  return name ? [{ id, name }] : [];
                })
                : [];
              return (
                <li key={player.playerId} className="atlas-online-panel__player" aria-label={player.name}>
                  <div className="atlas-online-panel__player-row">
                    <span className="atlas-online-panel__name">{player.name}</span>
                    {player.client === 'obsidian' && <ObsidianMark />}
                    {player.status === 'gone' && <span className="atlas-online-panel__note">Disconnected</span>}
                    <LabelTooltip label={`${REMOVE_PLAYER_LABEL} ${player.name}`}>
                      <Button variant="ghost" size="icon" aria-label={`${REMOVE_PLAYER_LABEL} ${player.name}`} onClick={() => service.kick(player.playerId)}>
                        <X />
                      </Button>
                    </LabelTooltip>
                  </div>
                  {tokens.length > 0 && (
                    <ul className="atlas-online-panel__chips" aria-label={`Tokens of ${player.name}`}>
                      {tokens.map((token) => <li key={token.id} className="atlas-online-panel__chip">{token.name}</li>)}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
