/** The update choice and the merge page as native Atlas modals; each resolves once, with null when closed without an answer. */
import React from 'react';
import { Modal, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../../../ui/nativeModal';
import type { UpdateContext } from '../../receive/notePull';
import type { AskResult, MergeAnswer, MergeRequest } from '../noteUpdate';
import { MergeView } from './MergeView';
import { UpdateChoiceForm } from './UpdateChoiceForm';

class AnswerModal<T> extends Modal {
  private root: Root | null = null;
  private answered = false;

  constructor(app: App, private readonly heading: string, cls: string, private readonly content: (answer: (value: T | null) => void) => React.ReactElement,
    private readonly resolve: (value: T | null) => void) {
    super(app);
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, cls);
  }

  onOpen(): void {
    this.setTitle(this.heading);
    this.root = createRoot(this.contentEl);
    this.root.render(this.content((value) => {
      this.answered = true;
      this.resolve(value);
      this.close();
    }));
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
    if (!this.answered) this.resolve(null);
  }
}

export function askUpdateChoice(app: App, context: UpdateContext): Promise<AskResult | null> {
  return new Promise((resolve) => {
    new AnswerModal<AskResult>(app, 'Shared note changed', 'atlas-merge-choice-modal',
      (answer) => <UpdateChoiceForm title={context.title} personName={context.personName} onAnswer={answer} />, resolve).open();
  });
}

export function openMergePage(app: App, request: MergeRequest): Promise<MergeAnswer | null> {
  return new Promise((resolve) => {
    new AnswerModal<MergeAnswer>(app, `Merge · ${request.context.title}`, 'atlas-merge-modal',
      (answer) => (
        <MergeView chunks={request.chunks} preview={request.preview} conflictDefault={request.conflictDefault}
          onSave={answer} onCancel={() => answer(null)} />
      ), resolve).open();
  });
}
