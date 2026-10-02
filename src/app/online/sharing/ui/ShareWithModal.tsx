/**
 * "Share with…" for a note or a map: tick people or everyone in my sessions; for a map also
 * player-safe or full and its linked notes. Notes keep their share in `atlas-share` (written,
 * then read back), maps on their scene record. Full asks first.
 */
import React from 'react';
import { Modal, Notice, TFile, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import type { AssetService, SceneAsset } from '../../../services/AssetService';
import { confirmAction } from '../../../ui/confirmDialog';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../../ui/nativeModal';
import { randomId } from '../../ids';
import type { PeopleBook } from '../people/PeopleBook';
import { keyOf } from '../people/peopleTypes';
import { readSharedMap } from '../model/buildMapPayload';
import { offeredNotes } from '../model/linkedNotes';
import { mapShareOf, writeMapShare, type MapShare } from '../model/mapShare';
import { unknownNamesIn, unreadablePrivateTextIn } from '../model/noteFilter';
import type { SenderCatalogue } from '../model/SenderCatalogue';
import { formatShareRule, parseShareRule, SHARE_PROPERTY, unknownRuleNames } from '../model/shareRule';
import { writeNoteShare } from '../model/shareWriting';
import { ShareWithForm, type ShareFormResult, type ShareRow } from './ShareWithForm';

export const SHARE_DIALOG_TITLE = 'Share with';
const FULL_CONFIRM = {
  title: 'Share the full map?',
  message: ['A full share sends everything on this map, as a co-GM would see it: hidden tokens, GM-only pins, walls and lights.'],
  confirmLabel: 'Share full map',
};
const MAX_UNREADABLE_WARNINGS = 3;

export interface ShareWithDeps {
  people: PeopleBook;
  catalogue: Pick<SenderCatalogue, 'previewNote'>;
  assets: Pick<AssetService, 'updateAsset' | 'getAssets'>;
}

const nameKey = (name: string): string => `name:${name}`;

class ShareWithModal extends Modal {
  private root: Root | null = null;

  constructor(app: App, private readonly file: TFile, private readonly deps: ShareWithDeps) {
    super(app);
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-share-modal');
  }

  onOpen(): void {
    this.setTitle(`${SHARE_DIALOG_TITLE} · ${this.file.basename}`);
    this.root = createRoot(this.contentEl);
    void this.render();
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
  }

  private async render(): Promise<void> {
    await this.deps.people.ready();
    const known: ShareRow[] = this.deps.people.list().map((person) => ({ key: keyOf(person), name: person.name, known: true }));
    if (this.file.extension === 'md') await this.renderNote(known);
    else await this.renderMap(known);
  }

  /** What the sender should know before saving: names the list lacks, and private text that could not be read. */
  private async noteWarnings(unknownInRule: readonly string[], unreadableRule: boolean): Promise<string[]> {
    const text = await this.app.vault.cachedRead(this.file);
    const unknown = [...new Set([...unknownInRule, ...unknownNamesIn(text, this.deps.people)])].sort();
    const unreadable = [...new Set(unreadablePrivateTextIn(text))].slice(0, MAX_UNREADABLE_WARNINGS);
    return [
      ...(unreadableRule ? [`An entry in the ${SHARE_PROPERTY} property could not be read, so this note is private. Save to write it again.`] : []),
      ...(unknown.length ? [`Not in your people list: ${unknown.join(', ')}.`] : []),
      ...unreadable.map((start) => `Could not read the private part that starts with "${start}". It is hidden from everyone.`),
    ];
  }

  private async renderNote(known: ShareRow[]): Promise<void> {
    const rule = parseShareRule(this.app.metadataCache.getFileCache(this.file)?.frontmatter?.[SHARE_PROPERTY]);
    const people = this.deps.people;
    const keyFor = (name: string): string => { const person = people.byName(name); return person ? keyOf(person) : nameKey(name); };
    const unknown = unknownRuleNames(rule, people);
    const rows = [...known, ...unknown.map((name) => ({ key: nameKey(name), name, known: false }))];
    const nameFor = (key: string): string => rows.find((row) => row.key === key)?.name ?? key.replace(/^name:/, '');
    const warnings = await this.noteWarnings(unknown, rule.unreadable === true);
    this.root?.render(
      <ShareWithForm
        rows={rows}
        initial={{ everyone: rule.public && !rule.private, people: rule.private ? [] : rule.only.map(keyFor), except: rule.except.map(keyFor) }}
        map={null}
        warnings={warnings}
        preview={(key) => {
          const person = people.byKey(key);
          return person ? this.deps.catalogue.previewNote({ tableId: person.tableId, personId: person.personId }, this.file.path) : Promise.resolve('');
        }}
        onCancel={() => this.close()}
        onSave={(result) => { void this.saveNote(result, nameFor); }}
      />,
    );
  }

  private async saveNote(result: ShareFormResult, nameFor: (key: string) => string): Promise<void> {
    const value = formatShareRule({ everyone: result.everyone, people: result.people.map(nameFor), except: result.except.map(nameFor) });
    const readBack = await writeNoteShare(this.app, this.file, value);
    const expected = parseShareRule(value);
    if (JSON.stringify(readBack) !== JSON.stringify(expected)) new Notice(`The note's ${SHARE_PROPERTY} property now reads differently; check it.`);
    this.close();
  }

  private async renderMap(known: ShareRow[]): Promise<void> {
    const scene = (await this.deps.assets.getAssets(undefined, 'scene')).find((candidate) => candidate.data?.mapPath === this.file.path);
    const source = scene ? await readSharedMap((path) => this.app.vault.adapter.read(path), this.file.path) : null;
    if (!scene || !source) {
      new Notice('This map has no scene in a collection, so it cannot be shared.');
      this.close();
      return;
    }
    const share = mapShareOf(scene);
    const notes = offeredNotes(source.map, 'full').map((note) => {
      const file = this.app.vault.getAbstractFileByPath(note.path);
      const property: unknown = file instanceof TFile ? this.app.metadataCache.getFileCache(file)?.frontmatter?.[SHARE_PROPERTY] : undefined;
      return { path: note.path, label: note.label, private: parseShareRule(property).private, hidden: note.hidden };
    });
    this.root?.render(
      <ShareWithForm
        rows={known}
        initial={{ everyone: share?.everyone ?? false, people: share?.people ?? [], except: share?.except ?? [] }}
        map={{ mode: share?.mode ?? 'player-safe', notes, ticked: share?.notes ?? [] }}
        preview={null}
        warnings={[]}
        onCancel={() => this.close()}
        onSave={(result) => { void this.saveMap(scene, share, result); }}
      />,
    );
  }

  private async saveMap(scene: SceneAsset, previous: MapShare | null, result: ShareFormResult): Promise<void> {
    if (result.mode === 'full' && previous?.mode !== 'full' && !(await confirmAction(FULL_CONFIRM))) return;
    const nobody = !result.everyone && result.people.length === 0;
    const next: MapShare | null = nobody ? null : {
      item: previous?.item ?? randomId(), everyone: result.everyone, people: result.people, except: result.except, mode: result.mode,
      notes: result.notes,
    };
    await writeMapShare(this.deps.assets, scene, next);
    this.close();
  }
}

export function openShareWithModal(app: App, file: TFile, deps: ShareWithDeps): void {
  new ShareWithModal(app, file, deps).open();
}
