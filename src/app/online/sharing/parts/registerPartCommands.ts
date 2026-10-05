/**
 * Share part on a selection in a Markdown note: the editor's right-click menu (flat "Share part: …" items,
 * since the Obsidian API has no public submenus) and the same four actions as commands, for hotkeys.
 * Each edit is one editor transaction, so one undo step, and the selection stays on the text.
 */
import { Notice, type Editor, type MarkdownFileInfo, type MarkdownView, type Plugin } from 'obsidian';
import type { PeopleBook } from '../people/PeopleBook';
import type { PartRule } from '../model/privateTags';
import { shareSessionStore } from '../shareSessionStore';
import { shareWithEveryone, wrapSelection, type PartEdit } from './partEdits';
import { partPeopleFrom } from './partPeople';
import { openPartPeopleModal, type PartPeopleKind } from './PartPeopleModal';
import { t } from '../../../i18n';

interface PartAction {
  id: string;
  command: string;
  menu: string;
  icon: string;
  run(editor: Editor): void;
}

const NOTE_CHANGED = t('share.part.noteChanged');

function selectionOffsets(editor: Editor): { from: number; to: number } {
  const anchor = editor.posToOffset(editor.getCursor('from'));
  const head = editor.posToOffset(editor.getCursor('to'));
  return { from: Math.min(anchor, head), to: Math.max(anchor, head) };
}

function apply(editor: Editor, edit: PartEdit | { refused: string } | null): void {
  if (!edit) return;
  if ('refused' in edit) {
    new Notice(edit.refused);
    return;
  }
  const { change, selection } = edit;
  editor.transaction({ changes: [{ from: editor.offsetToPos(change.from), to: editor.offsetToPos(change.to), text: change.text }] });
  editor.setSelection(editor.offsetToPos(selection.from), editor.offsetToPos(selection.to));
}

function wrap(editor: Editor, rule: PartRule): void {
  const { from, to } = selectionOffsets(editor);
  apply(editor, wrapSelection(editor.getValue(), from, to, rule));
}

function pickAndWrap(plugin: Plugin, people: PeopleBook, editor: Editor, kind: PartPeopleKind): void {
  const before = editor.getValue();
  const { from, to } = selectionOffsets(editor);
  void people.ready().then(() => openPartPeopleModal(plugin.app, kind, partPeopleFrom(shareSessionStore.getState(), people), (names) => {
    if (editor.getValue() !== before) {
      new Notice(NOTE_CHANGED);
      return;
    }
    apply(editor, wrapSelection(before, from, to, { kind, names }));
  }));
}

function actions(plugin: Plugin, people: PeopleBook): PartAction[] {
  return [
    { id: 'part-private', command: t('share.part.commandPrivate'), menu: t('share.part.menuPrivate'), icon: 'eye-off', run: (editor) => wrap(editor, { kind: 'private' }) },
    { id: 'part-only', command: t('share.part.commandOnly'), menu: t('share.part.menuOnly'), icon: 'user-check', run: (editor) => pickAndWrap(plugin, people, editor, 'only') },
    { id: 'part-except', command: t('share.part.commandExcept'), menu: t('share.part.menuExcept'), icon: 'user-x', run: (editor) => pickAndWrap(plugin, people, editor, 'except') },
    {
      id: 'part-everyone', command: t('share.part.commandEveryone'), menu: t('share.part.menuEveryone'), icon: 'users',
      run: (editor) => {
        const { from, to } = selectionOffsets(editor);
        apply(editor, shareWithEveryone(editor.getValue(), from, to));
      },
    },
  ];
}

const inMarkdownNote = (info: MarkdownView | MarkdownFileInfo): boolean => info.file?.extension === 'md';

export function registerPartCommands(plugin: Plugin, people: PeopleBook): void {
  const list = actions(plugin, people);
  for (const action of list) {
    plugin.addCommand({
      id: action.id, name: action.command, icon: action.icon,
      editorCheckCallback: (checking, editor, info) => {
        if (!editor.somethingSelected() || !inMarkdownNote(info)) return false;
        if (!checking) action.run(editor);
        return true;
      },
    });
  }
  plugin.registerEvent(plugin.app.workspace.on('editor-menu', (menu, editor, info) => {
    if (!editor.somethingSelected() || !inMarkdownNote(info)) return;
    for (const action of list) {
      menu.addItem((item) => item.setTitle(action.menu).setIcon(action.icon).setSection('selection').onClick(() => action.run(editor)));
    }
  }));
}
