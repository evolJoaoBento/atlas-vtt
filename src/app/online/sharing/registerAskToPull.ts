/** Ask to pull…: the sending side of push requests. It only shows the other person a prompt. */
import { Notice, type Plugin, type TFile } from 'obsidian';
import { AssetService } from '../../services/AssetService';
import { chooseAction } from '../../ui/confirmDialog';
import { mapShareOf } from './model/mapShare';
import type { ShareItems } from './model/ShareItems';
import { NO_SHARE_SESSION_TEXT } from './receive/ui/SharedWithMeModal';
import { shareable } from './registerShareCommands';
import { shareSessionStore } from './shareSessionStore';

interface PushableItem {
  item: string;
  kind: 'note' | 'map';
}

export function registerAskToPull(plugin: Plugin, items: Pick<ShareItems, 'idFor'>): void {
  const itemOf = async (file: TFile): Promise<PushableItem | null> => {
    if (file.extension === 'md') return { item: items.idFor(file.path), kind: 'note' };
    const scene = (await AssetService.getInstance(plugin.app).getAssets(undefined, 'scene')).find((candidate) => candidate.data?.mapPath === file.path);
    const share = scene ? mapShareOf(scene) : null;
    return share ? { item: share.item, kind: 'map' } : null;
  };
  const askToPull = async (file: TFile): Promise<void> => {
    const { session, people: present } = shareSessionStore.getState();
    if (!session) {
      new Notice(NO_SHARE_SESSION_TEXT);
      return;
    }
    const item = await itemOf(file);
    if (!item) {
      new Notice('Share this map first, then ask someone to pull it.');
      return;
    }
    if (present.length === 0) {
      new Notice('Nobody else in this session shares with Atlas in Obsidian.');
      return;
    }
    const person = await chooseAction({
      title: `Ask to pull ${file.basename}`,
      message: ['They get a prompt with Pull and Not now. They can pull it only if it is shared with them.'],
      choices: present.map((candidate) => ({ label: candidate.name, value: candidate.personId })),
    });
    if (person) session.node.push(person, item.item, item.kind, file.basename);
  };
  plugin.addCommand({
    id: 'ask-to-pull', name: 'Ask to pull…',
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!shareable(file) || !shareSessionStore.getState().session) return false;
      if (!checking) void askToPull(file);
      return true;
    },
  });
  plugin.registerEvent(plugin.app.workspace.on('file-menu', (menu, file) => {
    if (!shareable(file) || !shareSessionStore.getState().session) return;
    menu.addItem((item) => item.setTitle('Ask to pull…').setIcon('send').onClick(() => { void askToPull(file); }));
  }));
}
