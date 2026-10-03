/**
 * Token resources as Atlas's own token UI draws them in the online scene. Players receive bars
 * (a colour, a share and whether the bar is darkened), never definitions or numbers, so each
 * token gets stand-in definitions of its own: one per bar, in the colour the GM's window shows
 * it in, filled to the share (current out of `SHARE_SCALE`). Atlas's `ResourceBarView` then draws
 * exactly what the window does. A downed token carries a stand-in resource players never see,
 * which makes Atlas grey it and mark it with a skull as it does in the window.
 */
import type { ResourceDefinition, ResourceValue } from '../../resources/resourceTypes';
import { MAX_RESOURCES } from '../../resources/resourceTypes';
import { setOwn } from '../scene/sceneDiff';
import type { PlayerInitiative, PlayerResource, PlayerToken } from '../scene/sceneTypes';

/** A bar's share, as the stand-in value's `current` out of this. */
export const SHARE_SCALE = 100;
const BAR_KEY = 'bar';
export const DOWNED_KEY = 'downed';
const DOWNED_COLOR = '#ef4444';

export interface AtlasBars {
  /** The token's `resources`. */
  values: Record<string, ResourceValue>;
  /** The definitions those values are drawn by, in socket order. */
  definitions: ResourceDefinition[];
}

function barDefinition(bar: PlayerResource, slot: number): ResourceDefinition {
  // A spent bar is a draining one at 0 or a filling one at its maximum; Atlas darkens it, and its colour is the warning red
  const fills = bar.spent && bar.share >= 1;
  return {
    key: `${BAR_KEY}${slot}`, name: 'Resource', field: '', direction: fills ? 'fills' : 'drains', color: bar.color,
    visibleToPlayers: true, slot, ...(bar.spent ? { defeatedWhenSpent: true } : {}),
  };
}

function barValue(bar: PlayerResource): ResourceValue {
  const current = bar.spent && bar.share < 1 ? 0 : Math.round(bar.share * SHARE_SCALE);
  return { current, max: SHARE_SCALE };
}

/** The stand-ins of a token's bars and downed state; null when it has neither. */
export function atlasBars(token: PlayerToken): AtlasBars | null {
  const bars = (token.resources ?? []).slice(0, MAX_RESOURCES);
  if (bars.length === 0 && token.downed !== true) return null;
  const values: Record<string, ResourceValue> = {};
  const definitions = bars.map((bar, slot) => {
    const definition = barDefinition(bar, slot);
    values[definition.key] = barValue(bar);
    return definition;
  });
  if (token.downed === true) {
    // Out of players' sight (`visibleToPlayers`), in the last socket: only `isDefeated` reads it
    definitions.push({
      key: DOWNED_KEY, name: 'Downed', field: '', direction: 'drains', color: DOWNED_COLOR,
      defeatedWhenSpent: true, visibleToPlayers: false, slot: MAX_RESOURCES - 1,
    });
    values[DOWNED_KEY] = { current: 0, max: 1 };
  }
  return { values, definitions };
}

/** The stand-in definitions of every token that has any, by token id (`remoteScene.resources`). */
export function atlasResourceDefinitions(tokens: Readonly<Record<string, PlayerToken>>): Record<string, readonly ResourceDefinition[]> {
  const byToken: Record<string, readonly ResourceDefinition[]> = {};
  for (const [id, token] of Object.entries(tokens)) {
    const bars = atlasBars(token);
    if (bars) setOwn(byToken, id, bars.definitions);
  }
  return byToken;
}

/** The bar after each combatant's name in the initiative list, by token id (`remoteScene.initiativeHealth`): the share out of `SHARE_SCALE`. */
export function atlasInitiativeHealth(initiative: PlayerInitiative | null): Record<string, ResourceValue> {
  const health: Record<string, ResourceValue> = {};
  for (const entry of initiative?.entries ?? []) {
    if (typeof entry.hpShare === 'number') setOwn(health, entry.tokenId, { current: Math.round(entry.hpShare * SHARE_SCALE), max: SHARE_SCALE });
  }
  return health;
}
