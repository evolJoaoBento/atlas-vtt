/**
 * What a remote view shows of its owner's feed: the scene in its store (`RemoteSceneApplier`),
 * the placeholder background while the map image has no URL, the read-only initiative list, and
 * the player's part (`setPlayer`): which tokens move, the measurement, the badges, the bars.
 */
import type { App } from 'obsidian';
import { frozenCopy } from '../../api/frozen';
import type { RemotePlayerState, RemoteSceneInput } from '../../api/types/remoteViews';
import type { ResourceValue } from '../resources/resourceTypes';
import { PlayerInitiativePanel } from '../services/PlayerInitiativePanel';
import type { PlayerSettingsSource } from '../services/PlayerSceneOverlay';
import type { ViewAtlasStore } from '../storeFactory';
import { RemoteMapBackdrop, type BackdropRenderer } from './RemoteMapBackdrop';
import { RemoteSceneApplier } from './RemoteSceneApplier';
import { updateRemoteView } from './remoteViewState';

/** The owner decided what the player sees before feeding it: show everything that arrives. */
const SHOW_WHAT_ARRIVES: PlayerSettingsSource = {
  getLocalPlayerViewSettings: () => ({
    showToolbar: true, showTokenNameplates: true, showNotePreviews: false,
    showGrid: true, showWidgets: true, showInitiative: true, showDiceRolls: false, showCommandPalette: false,
  }),
  onChange: () => () => undefined,
};

/** What the scene part needs of the remote map view. */
export interface RemoteSceneHost {
  readonly app: App;
  readonly viewId: string;
  readonly atlasStore: ViewAtlasStore;
  readonly containerEl: HTMLElement;
  readonly renderer: BackdropRenderer | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkedScene(scene: unknown): RemoteSceneInput | null {
  if (scene === null) return null;
  const valid = isObject(scene) && isObject(scene.background) && isObject(scene.objects) && isObject(scene.widgets)
    && isObject(scene.tokenImages) && isObject(scene.initiative) && (scene.grid === null || isObject(scene.grid))
    && ['tokens', 'texts', 'drawings', 'fog'].every((kind) => isObject((scene.objects as Record<string, unknown>)[kind]));
  if (!valid) throw new Error('RemoteView.setScene: the scene must be a RemoteSceneInput, or null.');
  return scene as unknown as RemoteSceneInput;
}

function checkedPlayer(state: unknown): RemotePlayerState {
  const valid = isObject(state) && Array.isArray(state.movableTokenIds) && isObject(state.measurement)
    && isObject(state.tokenUi) && Array.isArray(state.tokenUi.conditions) && isObject(state.tokenUi.resources)
    && isObject(state.initiative) && isObject(state.initiative.health);
  if (!valid) throw new Error('RemoteView.setPlayer: the state must be a RemotePlayerState.');
  return frozenCopy(state as unknown as RemotePlayerState);
}

export class RemoteViewScene {
  private readonly applier: RemoteSceneApplier;
  private readonly backdrop: RemoteMapBackdrop | null;
  private readonly initiative: PlayerInitiativePanel;
  private background: RemoteSceneInput['background'] | null = null;

  constructor(private readonly host: RemoteSceneHost) {
    this.applier = new RemoteSceneApplier(host.atlasStore, `remote:${host.viewId}`);
    this.backdrop = host.renderer ? new RemoteMapBackdrop(host.renderer) : null;
    this.initiative = new PlayerInitiativePanel(host.app, SHOW_WHAT_ARRIVES);
    this.initiative.mount(host.containerEl);
    this.initiative.present(host.atlasStore);
    this.showBackdrop();
  }

  setScene(input: unknown): void {
    const scene = checkedScene(input);
    this.applier.apply(scene);
    this.background = scene ? { ...scene.background } : null;
    this.showBackdrop();
  }

  /** Writes the last scene again: a token's shown position changed (a drag ended). */
  refresh(): void {
    this.applier.refresh();
  }

  setPlayer(input: unknown): void {
    const state = checkedPlayer(input);
    const initiativeHealth: Record<string, ResourceValue> = {};
    for (const [tokenId, { value, max }] of Object.entries(state.initiative.health)) {
      Object.defineProperty(initiativeHealth, tokenId, { value: Object.freeze({ current: value, max }), enumerable: true });
    }
    updateRemoteView(this.host.atlasStore, {
      movableTokenIds: state.movableTokenIds,
      measurement: state.measurement,
      conditions: state.tokenUi.conditions,
      resources: state.tokenUi.resources,
      initiativeRules: state.initiative.rules,
      initiativeHealth: Object.freeze(initiativeHealth),
    });
    this.hideNonBars(state);
  }

  dispose(): void {
    this.backdrop?.dispose();
    this.initiative.destroy();
  }

  /** Definitions players may not see draw no bar here (a downed look's stand-in, say); they still mark the token defeated. */
  private hideNonBars(state: RemotePlayerState): void {
    const hidden = new Set<string>();
    for (const definitions of Object.values(state.tokenUi.resources)) {
      for (const definition of definitions) if (!definition.visibleToPlayers) hidden.add(definition.key);
    }
    const store = this.host.atlasStore;
    const { tokenSettings } = store.getState();
    const next = [...hidden].sort();
    if (next.join('\n') === [...tokenSettings.hiddenResources].sort().join('\n')) return;
    store.setState({ tokenSettings: { ...tokenSettings, hiddenResources: next } });
  }

  private showBackdrop(): void {
    this.backdrop?.show(this.background, this.host.atlasStore.getState().grid);
  }
}
