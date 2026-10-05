/** Receiving: the Shared with me command and buttons, push prompts, and pulled files that follow renames. */
import { Notice, type App, type Plugin } from 'obsidian';
import { AssetService } from '../../services/AssetService';
import { chooseAction, confirmAction, type ChoiceDialogOptions } from '../../ui/confirmDialog';
import { peopleListNames } from './model/forwardedParts';
import { MergeHistory, undoLastMerge, type UndoOutcome } from './merge/MergeHistory';
import { createUpdatePolicy } from './merge/noteUpdate';
import { askUpdateChoice, openMergePage } from './merge/ui/mergeModals';
import type { PeopleBook } from './people/PeopleBook';
import type { PulledItems, PulledRecord } from './receive/PulledItems';
import { pushPromptListener } from './receive/pushPrompts';
import { codeKindsText, type CodeKind } from './receive/executableContent';
import { SharedWithMe, type PulledCodeChoice } from './receive/SharedWithMe';
import { showPushPrompt } from './receive/ui/pushPrompt';
import { openSharedWithMeModal } from './receive/ui/SharedWithMeModal';
import { setSharedOpener } from './sharedFromView';
import { shareSessionStore, type ShareSession } from './shareSessionStore';
import { t } from '../../i18n';

const UNDO_NOTICE: Record<UndoOutcome, string> = {
  undone: t('share.merge.undone'),
  declined: t('share.merge.undoDeclined'),
  nothing: t('share.merge.nothingToUndo'),
};

const confirmMapUpdate = (title: string): Promise<'both' | 'theirs' | null> => chooseAction({
  title: t('share.merge.mapChanged', { title }),
  message: [t('share.merge.mapChangedMessage')],
  choices: [{ label: t('share.merge.keepBoth'), value: 'both' as const }, { label: t('share.merge.takeTheirs'), value: 'theirs' as const, style: 'warning' }],
});

/**
 * The question for a pulled note that holds code other plugins run. Pull without code is the last button, so it has
 * focus; Pull as is names the sender, since their code then runs here wherever those plugins are installed.
 */
export const pulledCodeDialog = (title: string, personName: string, kinds: readonly CodeKind[]): ChoiceDialogOptions<PulledCodeChoice> => ({
  title: t('share.code.title', { title }),
  message: [t('share.code.message', { name: personName, kinds: codeKindsText(kinds) }), t('share.code.advice')],
  choices: [
    { label: t('share.code.pullAsIs', { name: personName }), value: 'as-is', style: 'warning' },
    { label: t('share.code.pullWithout'), value: 'without', style: 'cta' },
  ],
});

const confirmCode = (title: string, personName: string, kinds: readonly CodeKind[]): Promise<PulledCodeChoice | null> =>
  chooseAction(pulledCodeDialog(title, personName, kinds));

const sessionName = (personId: string): string | null =>
  shareSessionStore.getState().people.find((person) => person.personId === personId)?.name ?? null;

/** One service per share session: a new session (a new node) gets a fresh one. */
function sharedWithMeFor(app: App, pulled: PulledItems, history: MergeHistory, people: PeopleBook): () => SharedWithMe | null {
  // Choices and the merge page run only inside a pull the receiver started.
  const policy = createUpdatePolicy({
    pulled, ask: (context) => askUpdateChoice(app, context), merge: (request) => openMergePage(app, request), warn: (message) => new Notice(message),
  });
  const replaced = (record: PulledRecord, before: string, after: string): Promise<void> => history.add(record, { at: Date.now(), before, after });
  let current: { node: ShareSession['node']; service: SharedWithMe } | null = null;
  return () => {
    const session = shareSessionStore.getState().session;
    if (!session) return null;
    if (current?.node !== session.node) {
      current = {
        node: session.node,
        service: new SharedWithMe({
          app, pulled, node: session.node, tableId: session.tableId, policy, replaced, rehomed: (record) => history.clear(record),
          nameOf: (personId) => sessionName(personId) ?? 'Someone',
          nameAt: peopleListNames(people, session.tableId),
          assets: AssetService.getInstance(app), confirmMapUpdate, confirmCode,
        }),
      };
    }
    return current.service;
  };
}

export function registerReceiving(plugin: Plugin, pulled: PulledItems, people: PeopleBook): void {
  void pulled.ready();
  void people.ready();
  const history = new MergeHistory(plugin.app.vault.adapter);
  const sharedWithMe = sharedWithMeFor(plugin.app, pulled, history, people);
  const open = (app: App): void => openSharedWithMeModal(app, sharedWithMe());
  plugin.addCommand({ id: 'shared-with-me', name: t('share.command.sharedWithMe'), callback: () => open(plugin.app) });
  plugin.addCommand({
    id: 'undo-shared-merge', name: t('share.command.undoMerge'),
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      const record = file ? pulled.byPath(file.path) : null;
      if (!record || record.kind !== 'note') return false;
      if (!checking) {
        void undoLastMerge(plugin.app, history, record, () => confirmAction({
          title: t('share.merge.undoTitle'),
          message: [t('share.merge.undoMessage')],
          confirmLabel: t('share.merge.undo'), destructive: true,
        })).then((outcome) => new Notice(UNDO_NOTICE[outcome]));
      }
      return true;
    },
  });
  plugin.addCommand({
    id: 'forget-shared-choice', name: t('share.command.forgetChoice'),
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      const record = file ? pulled.byPath(file.path) : null;
      if (!record || record.kind !== 'note' || (record.choice === undefined && record.silent === undefined)) return false;
      if (!checking) {
        pulled.forgetChoice(record.key);
        new Notice(t('share.merge.forgot'));
      }
      return true;
    },
  });
  setSharedOpener(open);
  plugin.register(() => setSharedOpener(null));
  // A push shows a prompt; only Pull writes anything.
  const prompts = pushPromptListener({ show: showPushPrompt, service: sharedWithMe, notify: (text) => new Notice(text) });
  plugin.register(shareSessionStore.subscribe(prompts));
  plugin.register(() => prompts.dispose());
  plugin.registerEvent(plugin.app.vault.on('rename', (file, oldPath) => pulled.renamed(oldPath, file.path)));
  // A deleted pulled file leaves its record without a path, so no later file is taken for it.
  plugin.registerEvent(plugin.app.vault.on('delete', (file) => pulled.deleted(file.path)));
}
