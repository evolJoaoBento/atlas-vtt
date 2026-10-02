/**
 * The Online scene tab: an Atlas map view of a session this Atlas joined, drawn by Atlas's own
 * renderer from a remote store, the way `PlayerView` is a map view with a player store. It never
 * opens a file. Closing it leaves the session. A tab Obsidian restores at startup has no session
 * and closes itself once the layout is ready.
 */
import type { WorkspaceLeaf } from 'obsidian';
import { Sprite, Texture } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type AtlasVTTPlugin from '../../../../main';
import { AtlasView } from '../../atlas-view';
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

/** An invisible placeholder at the map's size: PIXI's 1 px white texture, scaled. */
function placeholderSprite(width: number, height: number): Sprite {
  const sprite = new Sprite(Texture.WHITE);
  sprite.alpha = 0;
  sprite.width = width;
  sprite.height = height;
  return sprite;
}

export class OnlineSceneView extends AtlasView {
  private client: OnlineSceneClient | null = null;

  constructor(leaf: WorkspaceLeaf, plugin?: AtlasVTTPlugin) {
    super(leaf, plugin, true, true);
    // Opening a file, a dropped file or back/forward history would replace this tab and leave the session.
    this.navigation = false;
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
    // Only the view that is the session's sink leaves it; a copy that never attached closes quietly.
    const attached = this.client !== null;
    this.client?.dispose();
    this.client = null;
    if (attached) OnlineJoinService.forApp(this.app)?.leave();
    await super.onClose();
  }

  public onlineControls(): OnlineSceneControls | null {
    return this.client?.controls ?? null;
  }

  protected onContainerResized(): void {
    this.client?.resize();
  }

  /** Whether this view is the one showing the joined session. */
  get isAttached(): boolean {
    return this.client !== null;
  }

  private attachSession(): void {
    if (this.isClosed || this.client) return;
    const shown = this.app.workspace.getLeavesOfType(ONLINE_SCENE_VIEW_TYPE)
      .find((leaf) => leaf !== this.leaf && leaf.view instanceof OnlineSceneView && leaf.view.isAttached);
    if (shown) {
      // One tab per session: a copy (a split, a duplicate) gives way to the one that has it.
      this.leaf.detach();
      void this.app.workspace.revealLeaf(shown);
      return;
    }
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
      laserColor: () => this.serviceManager.getSettingsService().getLaserPointerSettings().color,
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
