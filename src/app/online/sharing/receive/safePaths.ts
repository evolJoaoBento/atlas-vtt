/**
 * Where shared items may land. Every title becomes a plain file name: no separators, no
 * characters Windows or Obsidian refuse, no leading or trailing dots, no reserved device names,
 * at most 100 characters. Every path is checked to stay inside its folder after normalising.
 */
import { normalizePath } from 'obsidian';

export const SHARED_ROOT = 'Shared';

const INVALID = /[\\/:*?"<>|#^[\]\p{Cc}]/gu;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_NAME = 100;

export function safeFileName(name: string, fallback = 'Untitled'): string {
  let cleaned = name.normalize('NFC').replace(INVALID, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '');
  if (cleaned.length > MAX_NAME) cleaned = cleaned.slice(0, MAX_NAME).replace(/[.\s]+$/g, '');
  if (!cleaned) return fallback;
  return RESERVED.test(cleaned) ? `${cleaned}_` : cleaned;
}

/** `Shared/<person>`, the folder of everything pulled from that person. */
export function sharedNoteFolder(personName: string): string {
  return `${SHARED_ROOT}/${safeFileName(personName, 'Someone')}`;
}

/** Whether `path` is strictly inside `folder`, with no `.` or `..` segment anywhere. */
export function isInside(path: string, folder: string): boolean {
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) return false;
  const normalized = normalizePath(path);
  return normalized.startsWith(`${normalizePath(folder)}/`);
}

/** `folder/stem.extension`, or `stem (2)`, `stem (3)`, … while `taken` says the path is used. */
export function freePath(folder: string, stem: string, extension: string, taken: (path: string) => boolean): string {
  let path = `${folder}/${stem}.${extension}`;
  for (let n = 2; taken(path); n++) path = `${folder}/${stem} (${n}).${extension}`;
  return path;
}
