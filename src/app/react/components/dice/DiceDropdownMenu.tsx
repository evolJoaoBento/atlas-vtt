import React, { useEffect, useRef, useState } from 'react';
import { cn } from 'src/utils/cn';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import { DiceTool } from '../../../tools/DiceTool';
import { DiceTray } from './DiceTray';
import type { TrayPool } from './diceTrayPool';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { diceFontClass, useDiceLook } from '../../hooks/useDiceLook';

export interface DiceDropdownMenuProps {
  diceTool: DiceTool;
  isOpen: boolean;
  onToggle: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Rolls the tray elsewhere instead of with `diceTool`: the online scene sends it to the GM. False: it could not go, so the tray stays open. */
  onRoll?: (pool: TrayPool, modifier: number) => boolean;
  /** The most dice the tray lets the player pick; the tray's own limit when unset. */
  maxDice?: number;
}

export function DiceDropdownMenu({ diceTool, isOpen, onToggle, triggerRef, onRoll, maxDice }: DiceDropdownMenuProps): React.ReactElement | null {
  const trayRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const { app } = useAtlasUI();
  const look = useDiceLook(app ?? undefined);
  const keepInView = useKeepInView(trayRef, isOpen, 'top');

  // ── Click-outside ────────────────────────────

  useEffect(() => {
    if (!isOpen) setNote(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as HTMLElement;
      if (triggerRef?.current?.contains(target)) return;
      if (target.closest('.atlas-dice-tray')) return;
      onToggle();
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onToggle, triggerRef]);

  // Hangs from its toolbar button inside the map view, like the other toolbar
  // dropdowns: it stays in the view's stacking order, so the DM dashboard and
  // the asset manager cover it. Closed, the tray unmounts and forgets its dice.
  if (!isOpen) return null;
  return (
    <div
      ref={trayRef}
      className={cn('atlas-dice-tray', diceFontClass(look), keepInView.capped && 'atlas-keep-in-view--capped')}
      style={keepInView.style}
    >
      <div className="atlas-dice-panel">
        <DiceTray
          {...(maxDice !== undefined ? { maxDice } : {})}
          onRoll={(formula, pool, modifier) => {
            if (onRoll) {
              if (!onRoll(pool, modifier)) {
                setNote("Couldn't send the roll. Check your connection.");
                return false;
              }
            } else diceTool.rollDice(formula);
            onToggle();
            return true;
          }}
        />
        {note && <div className="atlas-dice-note" role="status">{note}</div>}
      </div>
    </div>
  );
}
