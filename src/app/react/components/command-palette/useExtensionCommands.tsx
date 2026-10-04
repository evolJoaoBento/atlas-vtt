import React from 'react';
import { safely } from '../../../extensions/SlotRegistry';
import { paletteSlot } from '../../../extensions/slots';
import { useSlot } from '../../../extensions/useSlot';
import { viewContextOf } from '../../../extensions/viewContext';
import { ObsidianIcon } from '../ObsidianIcon';
import type { CommandOption } from './types';

export interface ExtensionCommands {
  /** The registered sections, in the order they were added; their options come after Atlas's own. */
  sections: Array<{ id: string; title: string }>;
  options: CommandOption[];
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
    const commands = safely(owner, `palette section "${section.id}"`, () => [...section.commands(ctx)], []);
    if (commands.length === 0) continue;
    result.sections.push({ id: sectionId, title: section.title });
    for (const command of commands) {
      result.options.push({
        id: `${sectionId}:${command.id}`,
        icon: <ObsidianIcon name={command.icon} />,
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
