/**
 * The online scene view's own part of its store: what the GM's scene and session decide beyond
 * Atlas's records, read by the toolbar, the status bar, the drag gate, the ruler and the
 * condition badges. Null in every other view, and never persisted (`partialize` names its
 * fields). The UI reaches the view's actions through `AtlasView.onlineControls()`.
 */
import type { StoreApi } from 'zustand';
import type { ResourceDefinition, ResourceValue } from '../../resources/resourceTypes';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { ViewAtlasState } from '../../storeFactory';
import type { DiceRollResult, DiceSelection } from '../../tools/diceRolling';
import type { InitiativeRules } from '../../types/initiativeRulesTypes';
import type { ConditionDefinition } from '../../types/collectionSettingsTypes';
import { withMeasurementDefaults, type PlayerMeasurement } from '../scene/sceneTypes';

export interface OnlineSceneStatus {
  /** The GM's session title. */
  title: string;
  /** `Connected`, `Connecting…`, `Reconnecting…`, `Waiting for the GM` or `Disconnected`. */
  connection: string;
  /** The status dot. */
  tone: 'connected' | 'pending' | 'ended';
  /** A line after the connection: waiting, no scene, or why the session ended; null for none. */
  message: string | null;
  /** Shows the Reconnect button. */
  reconnect: boolean;
}

export interface RemoteSceneState {
  /** The tokens this player may drag: the GM's latest `token-control` list. */
  movableTokenIds: readonly string[];
  /** The GM's measurement settings, for the drag ruler and the measure tool. */
  measurement: MeasurementSettings;
  /** Neutral definitions for the condition ids the scene shows. */
  conditions: readonly ConditionDefinition[];
  /** The stand-in resource definitions of each token that shows bars or is downed, by token id (`convertResources.ts`). */
  resources: Readonly<Record<string, readonly ResourceDefinition[]>>;
  /** How full the initiative list's bar is for each combatant's token, by token id: the share out of 100. */
  initiativeHealth: Readonly<Record<string, ResourceValue>>;
  /** How the GM's window groups the initiative list (`atlasInitiativeRules`); null until a scene arrives. */
  initiativeRules: InitiativeRules | null;
  status: OnlineSceneStatus;
  /** Whether the camera follows the GM; Follow GM and Fit map show while it does not. */
  following: boolean;
  /** `Move not allowed.` for a while after a refusal; null otherwise. */
  notice: string | null;
  /** The player's latest own roll, which the view throws as dice once (by id); null before the first. */
  ownRoll: DiceRollResult | null;
}

/** What the online scene's UI asks of its view. */
export interface OnlineSceneControls {
  followGm(): void;
  fitMap(): void;
  reconnect(): void;
  /** Sends a roll from the dice tray or the dice log; false when it could not go. */
  rollDice(dice: DiceSelection, modifier: number): boolean;
}

/** The object URLs the scene's images show by; null while an image is not ready. */
export interface RemoteImages {
  background(assetId: string | null): string | null;
  token(assetId: string | null): string | null;
}

/** The session title until the GM's arrives, as on the join page. */
export const DEFAULT_TABLE_TITLE = 'the table';

/** The GM's measurement as Atlas's settings. */
export function atlasMeasurement(measurement: PlayerMeasurement): MeasurementSettings {
  return {
    mode: measurement.mode,
    unitType: measurement.unitType,
    unitDistance: measurement.unitDistance,
    diagonalRule: measurement.diagonalRule,
    rangeBands: measurement.rangeBands.map((band) => ({ name: band.name, maxSquares: band.maxSquares })),
    coneAngle: measurement.coneAngle,
  };
}

export function initialRemoteScene(): RemoteSceneState {
  return {
    movableTokenIds: [],
    measurement: atlasMeasurement(withMeasurementDefaults(undefined)),
    conditions: [],
    resources: {},
    initiativeHealth: {},
    initiativeRules: null,
    status: { title: DEFAULT_TABLE_TITLE, connection: 'Connecting…', tone: 'pending', message: null, reconnect: false },
    following: true,
    notice: null,
    ownRoll: null,
  };
}

/** Changes part of a remote store's `remoteScene`; does nothing to a normal view's store. */
export function updateRemoteScene(
  store: Pick<StoreApi<ViewAtlasState>, 'getState' | 'setState'>,
  partial: Partial<RemoteSceneState>,
): void {
  const current = store.getState().remoteScene;
  if (!current) return;
  store.setState({ remoteScene: { ...current, ...partial } });
}
