/** Receiving: the Shared with me command and buttons, push prompts, and pulled files that follow renames. */
import { Notice, type App, type Plugin } from 'obsidian';
import { AssetService } from '../../services/AssetService';
import { chooseAction } from '../../ui/confirmDialog';
import { keepBothPolicy } from './receive/notePull';
import type { PulledItems } from './receive/PulledItems';
import { pushPromptListener } from './receive/pushPrompts';
import { SharedWithMe } from './receive/SharedWithMe';
import { showPushPrompt } from './receive/ui/pushPrompt';
import { openSharedWithMeModal } from './receive/ui/SharedWithMeModal';
import { setSharedOpener } from './sharedFromView';
import { shareSessionStore, type ShareSession } from './shareSessionStore';

const confirmMapUpdate = (title: string): Promise<'both' | 'theirs' | null> => chooseAction({
  title: `${title} changed here and was shared again`,
  message: ['Keep both saves the new version as a second scene. Take theirs replaces your copy.'],
  choices: [{ label: 'Keep both', value: 'both' as const }, { label: 'Take theirs', value: 'theirs' as const, style: 'warning' }],
});

/** One service per share session: a new session (a new node) gets a fresh one. */
function sharedWithMeFor(app: App, pulled: PulledItems): () => SharedWithMe | null {
  let current: { node: ShareSession['node']; service: SharedWithMe } | null = null;
  return () => {
    const session = shareSessionStore.getState().session;
    if (!session) return null;
    if (current?.node !== session.node) {
      current = {
        node: session.node,
        service: new SharedWithMe({
          app, pulled, node: session.node, tableId: session.tableId, policy: keepBothPolicy,
          nameOf: (personId) => shareSessionStore.getState().people.find((person) => person.personId === personId)?.name ?? 'Someone',
          assets: AssetService.getInstance(app), confirmMapUpdate,
        }),
      };
    }
    return current.service;
  };
}

export function registerReceiving(plugin: Plugin, pulled: PulledItems): void {
  void pulled.ready();
  const sharedWithMe = sharedWithMeFor(plugin.app, pulled);
  const open = (app: App): void => openSharedWithMeModal(app, sharedWithMe());
  plugin.addCommand({ id: 'shared-with-me', name: 'Shared with me…', callback: () => open(plugin.app) });
  setSharedOpener(open);
  plugin.register(() => setSharedOpener(null));
  // A push shows a prompt; only Pull writes anything.
  plugin.register(shareSessionStore.subscribe(pushPromptListener({
    show: showPushPrompt, service: sharedWithMe, notify: (text) => new Notice(text),
  })));
  plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => pulled.renamed(oldPath, file.path)));
  // A deleted pulled file leaves its record without a path, so no later file is taken for it.
  plugin.registerEvent(plugin.app.vault.on('delete', (file) => pulled.deleted(file.path)));
}
