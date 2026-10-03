/**
 * The update policy for a note changed on both sides, used only inside a pull: the note's
 * remembered choice, or the receiver's answer. Keep both, keep mine, take theirs, resolve
 * conflicts (the merge page), or auto merge (one-sided changes and the note's conflict
 * default, shown on the merge page unless the note is set to silent).
 */
import type { NoteUpdatePolicy, UpdateContext, UpdateResult } from '../receive/notePull';
import type { ConflictDefault, PulledItems, UpdateChoice } from '../receive/PulledItems';
import { diff3, type MergeChunk } from './diff3';
import { mergedText } from './mergeResult';

export interface AskResult {
  choice: UpdateChoice;
  remember: boolean;
  silent: boolean;
}

export interface MergeRequest {
  context: UpdateContext;
  chunks: MergeChunk[];
  /** An auto merge's result to start from; null for Resolve conflicts. */
  preview: string | null;
  conflictDefault: ConflictDefault;
}

export interface MergeAnswer {
  text: string;
  conflictDefault: ConflictDefault;
}

export interface UpdatePolicyDeps {
  pulled: Pick<PulledItems, 'update'>;
  /** Null when the receiver closes the dialog: nothing changes. */
  ask(context: UpdateContext): Promise<AskResult | null>;
  /** The merge page; null when it is closed without saving. */
  merge(request: MergeRequest): Promise<MergeAnswer | null>;
}

export function createUpdatePolicy(deps: UpdatePolicyDeps): NoteUpdatePolicy {
  return {
    async resolve(context: UpdateContext): Promise<UpdateResult> {
      const { record } = context;
      let choice = record.choice;
      let silent = record.silent === true;
      if (!choice) {
        const answer = await deps.ask(context);
        if (!answer) return { kind: 'cancel' };
        choice = answer.choice;
        silent = answer.silent;
        if (answer.remember) deps.pulled.update(record.key, { choice, ...(silent ? { silent: true } : {}) });
      }
      if (choice === 'both') return { kind: 'both' };
      if (choice === 'mine') return { kind: 'keep' };
      if (choice === 'theirs') return { kind: 'write', text: context.theirs };
      const conflictDefault = record.conflictDefault ?? 'both';
      const chunks = diff3(context.base, context.mine, context.theirs);
      const automatic = mergedText(chunks, [], conflictDefault);
      if (choice === 'auto' && silent) return { kind: 'write', text: automatic };
      const answer = await deps.merge({ context, chunks, preview: choice === 'auto' ? automatic : null, conflictDefault });
      if (!answer) return { kind: 'cancel' };
      if (answer.conflictDefault !== conflictDefault) deps.pulled.update(record.key, { conflictDefault: answer.conflictDefault });
      return { kind: 'write', text: answer.text };
    },
  };
}
