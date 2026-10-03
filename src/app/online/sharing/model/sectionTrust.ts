/**
 * Whether Obsidian's sections of a note were parsed from the text the filter is about to read. The metadata
 * cache says what it parsed with `metadataCache.on('changed', (file, data))`; sections are trusted only when
 * that data is the text read now. A note changed since (a `modify` with no `changed` after it) is not trusted
 * either. A note neither parsed nor changed since startup keeps the cache Obsidian loaded and checked itself.
 * Untrusted sections are passed on as null, so the filter keeps every tag back (`noteSections.ts`).
 */
import type { App, CachedMetadata, Plugin, TAbstractFile, TFile } from 'obsidian';
import type { NoteSection } from './noteSections';

/** The events this listens to, as `App` has them. */
export interface SectionEvents {
  onModify(listener: (path: string) => void): void;
  onParsed(listener: (path: string, data: string) => void): void;
  onRename(listener: (path: string, oldPath: string) => void): void;
  onDelete(listener: (path: string) => void): void;
}

export class SectionTrust {
  /** The text each note's sections were last parsed from, by path. */
  private readonly parsed = new Map<string, string>();
  /** Notes changed since they were last parsed. */
  private readonly modified = new Set<string>();

  constructor(events: SectionEvents) {
    events.onModify((path) => this.modified.add(path));
    events.onParsed((path, data) => {
      this.parsed.set(path, data);
      this.modified.delete(path);
    });
    events.onRename((path, oldPath) => {
      const data = this.parsed.get(oldPath);
      this.parsed.delete(oldPath);
      if (data !== undefined) this.parsed.set(path, data);
      if (this.modified.delete(oldPath)) this.modified.add(path);
    });
    events.onDelete((path) => {
      this.parsed.delete(path);
      this.modified.delete(path);
    });
  }

  /** `sections` when they were parsed from `text`; null otherwise. */
  trusted(path: string, text: string, sections: readonly NoteSection[] | null | undefined): readonly NoteSection[] | null {
    if (!sections) return null;
    const data = this.parsed.get(path);
    if (data !== undefined) return data === text ? sections : null;
    return this.modified.has(path) ? null : sections;
  }
}

/** A `SectionTrust` fed by the app's vault and metadata cache events, registered on `plugin`. */
export function sectionTrustFor(plugin: Plugin): SectionTrust {
  const { vault, metadataCache } = plugin.app;
  return new SectionTrust({
    onModify: (listener) => plugin.registerEvent(vault.on('modify', (file: TAbstractFile) => listener(file.path))),
    onParsed: (listener) => plugin.registerEvent(metadataCache.on('changed', (file: TFile, data: string, _cache: CachedMetadata) => listener(file.path, data))),
    onRename: (listener) => plugin.registerEvent(vault.on('rename', (file: TAbstractFile, oldPath: string) => listener(file.path, oldPath))),
    onDelete: (listener) => plugin.registerEvent(vault.on('delete', (file: TAbstractFile) => listener(file.path))),
  });
}

/** The sections of `file` for `text`, when they can be trusted (`SectionTrust`). */
export function trustedSections(app: App, trust: SectionTrust, file: TFile, text: string): readonly NoteSection[] | null {
  return trust.trusted(file.path, text, app.metadataCache.getFileCache(file)?.sections);
}
