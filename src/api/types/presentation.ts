import type { Disposer, ViewId } from './common';

export interface PresentedSceneInfo {
  /**
   * Names one presentation: the same while it is held and resumed, new for every `present` (and every
   * presentation the GM starts), even of the same tab, and never repeated after Atlas reloads. Compare it to tell a new presentation from the one you know.
   */
  presentationId: string;
  viewId: ViewId; tabId: string; mapPath: string; held: boolean;
}

export interface PresentationListener {
  /** `resumed`: a held scene is shown again after its tab came back and loaded. */
  presented?(scene: PresentedSceneInfo, resumed: boolean): void;
  /** The GM switched the presented view to another tab; players keep the last scene they saw. */
  held?(scene: PresentedSceneInfo): void;
  /** Nothing is presented: stopped, the view closed, or its tab was closed. `previous.held` is true when the scene was held as it was cleared. */
  cleared?(previous: PresentedSceneInfo): void;
}

export interface PresentationTarget {
  id: string;
  /** e.g. "online players" */
  label: string;
  /** While any target is active, the scene tab's eye presents without opening the player window, its tooltip names the target, a presented scene's eye stops presenting, and right-click offers "Open player window". */
  isActive(): boolean;
}

export interface PresentationApi {
  current(): PresentedSceneInfo | null;
  /**
   * Switches `viewId` to `tabId` (default: its active tab), waits for the load, presents. Never throws.
   * False for a closed view or when nothing new is on screen. After a failed load the scene stays registered
   * as presented but held (`current().held === true`), and `presented(scene, true)` follows if its map later loads.
   */
  present(viewId: ViewId, tabId?: string): Promise<boolean>;
  stop(): void;
  subscribe(listener: PresentationListener): Disposer;
  addTarget(target: PresentationTarget): Disposer;
}
