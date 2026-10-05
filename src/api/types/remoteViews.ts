import type { Disposer, ViewId } from './common';
import type {
  ConditionDefinition, DiceRollResult, GridState, InitiativeRules, InitiativeState, MeasurementSettings, ResourceDefinition,
} from './records';
import type { TokenMove } from './tokens';
import type { SceneSnapshot, ViewCamera } from './views';

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
 * listener runs guarded and is dropped when the view closes. `views.*`, `lasers.*` and `tokens.snapPoint` take its `viewId`;
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
  /** The status bar at the start of the view's top row; its action runs guarded. Throws when `status` is not a RemoteStatus. */
  setStatus(status: RemoteStatus): void;
  /** The shared log shown in this view's dice log (the first 100 entries, copied); Clear is hidden, Roll again calls `onRoll`. */
  setDiceLog(entries: readonly DiceRollResult[]): void;
  /** Throws one of the player's own rolls with their Atlas dice look; a result card where WebGL is unavailable. Once per result id. */
  throwRoll(result: DiceRollResult): void;
  /**
   * Shows `camera`'s world area as large as fits the view, gliding with `animate`, else at once; it keeps showing it through
   * resizes until the player moves the camera. Throws when `camera` is not finite numbers with a size above 0.
   */
  setCamera(camera: ViewCamera, options?: { animate?: boolean }): void;
  /** Ends a drag in progress; the token goes back. */
  cancelDrag(): void;
  /** The player let go of a token they may move, at the snapped drop point. The token goes back until the scene moves it. */
  onTokenDrop(listener: (move: TokenMove) => void): Disposer;
  /** The player moved the camera (`byUser`), or Fit map ran; lets the extension stop following the GM. */
  onCameraMoved(listener: (byUser: boolean) => void): Disposer;
  /**
   * The dice tray (at most 100 dice) or Roll again; return null once sent, or why not (shown in the tray, or as a notice for
   * Roll again). Listeners are asked in the order they were added until one returns null; a roll is sent by one listener at
   * most. With no listener, or when none sent it, the first reason given shows ("The roll could not be sent." for a listener
   * that throws or for none). The tray never rolls locally in a remote view.
   */
  onRoll(listener: (dice: Readonly<Record<string, number>>, modifier: number) => string | null): Disposer;
  /** Called once when the view closes: `close()`, the user closing the tab, the extension or Atlas unloading. */
  onClose(listener: () => void): Disposer;
  close(): void;
}
