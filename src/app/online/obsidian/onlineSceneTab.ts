import type { App } from 'obsidian';
import { t } from '../../i18n';

/** The Online scene view: the presented scene of a session this Atlas joined. */
export const ONLINE_SCENE_VIEW_TYPE = 'atlas-online-scene';
export const ONLINE_SCENE_TITLE = t('online.scene.title');

/** Opens the Online scene in a new tab, or shows the one already open. */
export async function openOnlineSceneTab(app: App): Promise<void> {
  const open = app.workspace.getLeavesOfType(ONLINE_SCENE_VIEW_TYPE)[0];
  if (open) {
    await app.workspace.revealLeaf(open);
    return;
  }
  const leaf = app.workspace.getLeaf('tab');
  await leaf.setViewState({ type: ONLINE_SCENE_VIEW_TYPE, active: true });
  await app.workspace.revealLeaf(leaf);
}
