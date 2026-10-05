import React from 'react';
import { safely } from '../../../extensions/SlotRegistry';
import { paletteSlot } from '../../../extensions/slots';
import { useSlot } from '../../../extensions/useSlot';
import { viewContextOf } from '../../../extensions/viewContext';
import { ObsidianIcon } from '../ObsidianIcon';
import type { PaletteCommand } from '../../../../api/types/ui';
import type { CommandOption } from './types';

export interface ExtensionCommands {
  /** The registered sections, in the order they were added; their options come after Atlas's own. */
  sections: Array<{ id: string; title: string }>;
  options: CommandOption[];
}

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** What `commands()` returned, less the entries that are not commands (logged); throws when it is no list. */
function validCommands(owner: string, returned: unknown): PaletteCommand[] {
  const list = [...(returned as Iterable<unknown>)];
  return list.filter((entry): entry is PaletteCommand => {
    const command = entry as Partial<PaletteCommand> | null;
    const ok = typeof command === 'object' && command !== null && isText(command.id) && isText(command.label) && typeof command.run === 'function';
    if (!ok) console.error(`[Atlas API] ${owner}: a palette command is malformed and was skipped:`, entry);
    return ok;
  });
}

/** The commands other plugins added to the palette. Their callbacks run guarded: a section that throws shows nothing. */
export function useExtensionCommands(
  viewId: string | undefined,
  store: { getState(): { isPlayerView?: boolean } },
  onClose: () => void,
): ExtensionCommands {
  const entries = useSlot(paletteSlot);
  const result: ExtensionCommands = { sections: [], options: [] };
  if (!viewId) return result;
  const ctx = viewContextOf({ viewId }, store);
  for (const { owner, item: section } of entries) {
    const sectionId = `ext:${owner}:${section.id}`;
    const commands = safely(owner, `palette section "${section.id}"`, () => validCommands(owner, section.commands(ctx)), []);
    if (commands.length === 0) continue;
    result.sections.push({ id: sectionId, title: section.title });
    for (const command of commands) {
      result.options.push({
        id: `${sectionId}:${command.id}`,
        icon: isText(command.icon) ? <ObsidianIcon name={command.icon} /> : null,
        label: command.label,
        keywords: command.keywords ?? [],
        section: sectionId,
        action: () => {
          safely(owner, `palette command "${command.id}"`, () => { command.run(); }, undefined);
          onClose();
        },
      });
    }
  }
  return result;
}
