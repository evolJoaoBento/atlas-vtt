/**
 * The Online scene tab: an Atlas map view of a session this Atlas joined, drawn by Atlas's own
 * renderer from a remote store, the way `PlayerView` is a map view with a player store. It never
 * opens a file. Closing it leaves the session. A tab Obsidian restores at startup has no session
 * and closes itself once the layout is ready.
 */
import type { WorkspaceLeaf } from 'obsidian';
import { Sprite } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type AtlasVTTPlugin from '../../../../main';
import { AtlasView } from '../../atlas-view';
import { placeholderTexture } from '../../MapLoader';
import { PlayerInitiativePanel } from '../../services/PlayerInitiativePanel';
import type { PlayerSettingsSource } from '../../services/PlayerSceneOverlay';
import { OnlineJoinService } from './OnlineJoinService';
import { OnlineSceneClient } from './OnlineSceneClient';
import { ONLINE_SCENE_TITLE, ONLINE_SCENE_VIEW_TYPE } from './onlineSceneTab';
import type { OnlineSceneControls } from './remoteScene';
import { RemoteMapBackdrop } from './RemoteMapBackdrop';
import type { FollowViewport } from './ViewportFollower';

/** The GM's player view rules were applied before sending: show everything that arrives. */
const SHOW_WHAT_ARRIVES: PlayerSettingsSource = {
  getLocalPlayerViewSettings: () => ({
    showToolbar: true, showTokenHP: true, showTokenStress: true, showTokenNameplates: true, showNotePreviews: false,
    showGrid: true, showWidgets: true, showInitiative: true, showDiceRolls: false, showCommandPalette: false,
  }),
  onChange: () => () => undefined,
};

function followViewport(viewport: Viewport): FollowViewport {
  return {
    get screenWidth(): number { return viewport.screenWidth; },
    get screenHeight(): number { return viewport.screenHeight; },
    get center(): { x: number; y: number } { return viewport.center; },
    get scale(): { x: number } { return viewport.scale; },
    setZoom: (scale) => viewport.setZoom(scale),
    moveCenter: (x, y) => viewport.moveCenter(x, y),
    on: (event, listener) => viewport.on(event, listener),
    off: (event, listener) => viewport.off(event, listener),
  };
}

/** Atlas's transparent placeholder at the map's size. */
function placeholderSprite(width: number, height: number, cellSize: number): Sprite {
  const sprite = new Sprite(placeholderTexture(cellSize));
  sprite.width = width;
  sprite.height = height;
  return sprite;
}

export class OnlineSceneView extends AtlasView {
  private client: OnlineSceneClient | null = null;

  constructor(leaf: WorkspaceLeaf, plugin?: AtlasVTTPlugin) {
    super(leaf, plugin, true, true);
  }

  getViewType(): string {
    return ONLINE_SCENE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return ONLINE_SCENE_TITLE;
  }

  getIcon(): string {
    return 'network';
  }

  /** A session never survives a restart, so the workspace keeps nothing of it. */
  getState(): { mapFilePath: null } {
    return { mapFilePath: null };
  }

  async setState(): Promise<void> {
    // Nothing to restore: `onOpen` attaches to the session this Atlas joined.
  }

  async onOpen(): Promise<void> {
    await super.onOpen();
    if (this.isClosed) return;
    this.containerEl.addClass('atlas-online-scene');
    this.app.workspace.onLayoutReady(() => this.attachSession());
  }

  async onClose(): Promise<void> {
    this.client?.dispose();
    this.client = null;
    // Closing the tab leaves the session.
    OnlineJoinService.forApp(this.app)?.leave();
    await super.onClose();
  }

  public onlineControls(): OnlineSceneControls | null {
    return this.client?.controls ?? null;
  }

  protected onContainerResized(): void {
    this.client?.resize();
  }

  private attachSession(): void {
    if (this.isClosed || this.client) return;
    const service = OnlineJoinService.forApp(this.app);
    const viewport = this.serviceManager.getRendererService().getViewport();
    const renderer = this.renderer;
    if (!service || !viewport || !renderer) {
      this.leaf.detach();
      return;
    }
    const client = new OnlineSceneClient({
      store: this.atlasStore,
      service,
      viewport: followViewport(viewport),
      backdrop: new RemoteMapBackdrop(renderer, placeholderSprite),
      initiative: new PlayerInitiativePanel(this.app, SHOW_WHAT_ARRIVES),
      parent: this.containerEl,
      eventBus: this.serviceManager.getEventBus(),
      laserHub: renderer.getLaserHub(),
      closeTab: () => this.leaf.detach(),
    });
    if (!client.attach()) {
      client.dispose();
      this.leaf.detach();
      return;
    }
    this.client = client;
  }
}
