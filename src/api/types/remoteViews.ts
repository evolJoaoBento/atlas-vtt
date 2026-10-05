import type { Disposer, ViewId } from './common';
import type {
  ConditionDefinition, GridState, InitiativeRules, InitiativeState, MeasurementSettings, ResourceDefinition,
} from './records';
import type { SceneSnapshot } from './views';

export interface RemoteSceneInput {
  /** Records in Atlas's own types; images by URL (object URLs are released by the caller after replacing them). */
  background: { url: string | null; width: number; height: number };
  grid: GridState | null;
  objects: SceneSnapshot['objects'];
  /** Token image URL by token id. */
  tokenImages: Readonly<Record<string, string | null>>;
  widgets: SceneSnapshot['widgets'];
  initiative: InitiativeState;
}

export interface RemotePlayerState {
  movableTokenIds: readonly string[];
  measurement: MeasurementSettings;
  /**
   * Stand-ins the GM's projection decided on; players never receive the GM's definitions. A resource definition with
   * `visibleToPlayers: false` draws no bar in the remote view; it still counts for the downed look (`defeatedWhenSpent`).
   */
  tokenUi: { conditions: readonly ConditionDefinition[]; resources: Readonly<Record<string, readonly ResourceDefinition[]>> };
  initiative: { rules: InitiativeRules | null; health: Readonly<Record<string, { value: number; max: number }>> };
}

export interface RemoteStatus {
  title: string;
  connection: string;
  tone: 'connected' | 'pending' | 'ended';
  message: string | null;
  action?: { label: string; run(): void };
}

export interface RemoteViewsApi {
  /** Opens (or reveals, with `reuse`) a tab of type `atlas-vtt-remote`, owned by the calling extension. */
  open(options: { title: string; icon?: string; reuse?: boolean }): Promise<RemoteView>;
}

/**
 * A remote view: read-only, never saved, with no undo history. Every method does nothing once the view closed, and every
 * listener runs guarded and is dropped when the view closes. `views.*` and `lasers.*` take its `viewId`;
 * `views.active()` never returns it, and `tokens.move` and `presentation.present` refuse it.
 */
export interface RemoteView {
  readonly viewId: ViewId;
  /**
   * Shows the scene: copied, so the caller keeps no reference into Atlas, and the snapshot is loaded with the map path
   * `remote:<viewId>`. Null shows an empty, unloaded scene. A record handed again as the same object is not copied again.
   */
  setScene(scene: RemoteSceneInput | null): void;
  setPlayer(state: RemotePlayerState): void;
  /** Called once when the view closes: `close()`, the user closing the tab, the extension or Atlas unloading. */
  onClose(listener: () => void): Disposer;
  close(): void;
}
