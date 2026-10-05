import React, { useState, useEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import { App, FileView, Notice } from 'obsidian';
import { getActiveWorkspaceLeaf } from '../../utils/embeddedLeafFocus';
import { openContextMenuGlobal, type ContextMenuEntry } from '../root/ContextMenuContext';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { providedMenuEntries } from '../../extensions/menuEntries';
import { viewMenuSlot } from '../../extensions/slots';
import { viewContextOf } from '../../extensions/viewContext';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useViewStoreHook } from '../ViewStoreContext';

interface ViewActionsMenuProps {
  app: App;
  filePath?: string | undefined;
}

export const ViewActionsMenu: React.FC<ViewActionsMenuProps> = ({ app, filePath }) => {
  const [isVisible, setIsVisible] = useState(false);
  const { view } = useAtlasUI();
  const store = useViewStoreHook();

  useEffect(() => {
    // mount tracking (no-op)
  }, []);

  const showMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();

    let activeLeaf = getActiveWorkspaceLeaf(app.workspace);

    if (filePath && activeLeaf) {
      const leaves = app.workspace.getLeavesOfType('atlas-vtt');
      const matchingLeaf = leaves.find(leaf => leaf.view instanceof FileView && leaf.view.file?.path === filePath);
      if (matchingLeaf) activeLeaf = matchingLeaf;
    }

    if (!activeLeaf) return;

    const entries: ContextMenuEntry[] = [
      { type: 'item', label: 'Split right', icon: 'separator-vertical', onClick: () => app.workspace.createLeafBySplit(activeLeaf, 'vertical') },
      { type: 'item', label: 'Split down', icon: 'separator-horizontal', onClick: () => app.workspace.createLeafBySplit(activeLeaf, 'horizontal') },
      { type: 'item', label: 'Move to new window', icon: 'maximize', onClick: () => app.workspace.moveLeafToPopout(activeLeaf) },
      // What other plugins added, read now so the menu is current
      ...(view ? providedMenuEntries(viewMenuSlot, 'view menu items', viewContextOf(view, store)) : []),
    ];

    if (filePath) {
      entries.push(
        {
          type: 'item', label: 'Reveal in file explorer', icon: 'folder-open',
          onClick: async () => {
            const file = app.vault.getAbstractFileByPath(filePath);
            if (file) app.showInFolder(file.path);
          },
        },
        {
          type: 'item', label: 'Copy file path', icon: 'copy',
          onClick: () => {
            navigator.clipboard.writeText(filePath).then(
              () => new Notice('File path copied to clipboard'),
              (error: unknown) => {
                console.error('[ViewActionsMenu] Copying the file path failed:', error);
                new Notice('Could not copy the file path');
              },
            );
          },
        },
        {
          type: 'item', label: 'Rename...', icon: 'pencil',
          onClick: async () => {
            const file = app.vault.getAbstractFileByPath(filePath);
            if (file) app.fileManager.promptForFileRename?.(file);
          },
        },
        {
          type: 'item', label: 'Delete', icon: 'trash', destructive: true,
          onClick: async () => {
            const file = app.vault.getAbstractFileByPath(filePath);
            if (file) await app.fileManager.trashFile(file);
          },
        },
      );
    }

    entries.push(
      { type: 'item', label: 'Close', icon: 'x', onClick: () => activeLeaf.detach() },
    );

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    openContextMenuGlobal(entries, { x: rect.right, y: rect.bottom });
  };

  return (
    <div
      className="atlas-view-actions"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <LabelTooltip label="More options">
        <button
          className={`atlas-view-actions-btn clickable-icon view-action ${isVisible ? 'visible' : ''}`}
          onClick={showMenu}
        >
          <MoreVertical size={16} />
        </button>
      </LabelTooltip>
    </div>
  );
}
