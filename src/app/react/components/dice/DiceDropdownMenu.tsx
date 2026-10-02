import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from 'src/utils/cn';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import { DiceTool } from '../../../tools/DiceTool';
import { diceFormula } from '../../../tools/diceRolling';
import { DiceGrid } from './DiceGrid';
import { DiceFormulaBar } from './DiceFormulaBar';
import { DiceToastContainer } from './DiceToastContainer';

interface DiceSelection {
  [die: string]: number;
}

export interface DiceDropdownMenuProps {
  diceTool: DiceTool;
  isOpen: boolean;
  onToggle: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Rolls the picks elsewhere instead of with `diceTool`: the online scene sends them to the GM. */
  onRoll?: (selection: Readonly<Record<string, number>>) => void;
  /** Atlas's dice toasts follow the document-wide dice event; the online scene shows none. */
  showToasts?: boolean;
}

export function DiceDropdownMenu({ diceTool, isOpen, onToggle, triggerRef, onRoll, showToasts = true }: DiceDropdownMenuProps): React.ReactElement {
  const [selection, setSelection] = useState<DiceSelection>({});
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const portalRef = useRef<HTMLDivElement>(null);
  const keepInView = useKeepInView(portalRef, isOpen, 'top', `${position.left},${position.top}`);

  // ── Dice add / remove ────────────────────────

  const handleAdd = useCallback((die: string, event: React.MouseEvent): void => {
    event.stopPropagation();
    event.preventDefault();
    setSelection((prev) => ({ ...prev, [die]: (prev[die] ?? 0) + 1 }));
  }, []);

  const handleRemove = useCallback((die: string, event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    setSelection((prev) => {
      const next = { ...prev };
      if (next[die] !== undefined && next[die] > 1) {
        next[die]--;
      } else {
        delete next[die];
      }
      return next;
    });
  }, []);

  // ── Roll & clear ─────────────────────────────

  const handleRoll = useCallback((): void => {
    const formula = diceFormula(selection);
    if (!formula) return;

    if (onRoll) onRoll(selection);
    else diceTool.rollDice(formula);
    onToggle();
  }, [selection, diceTool, onToggle, onRoll]);

  const handleClear = useCallback((): void => {
    setSelection({});
  }, []);

  // ── Position & reset when opened ─────────────

  useEffect(() => {
    if (!isOpen) {
      setSelection({});
      return;
    }
    if (triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({ top: rect.top - 16, left: rect.left + rect.width / 2 });
    }
  }, [isOpen, triggerRef]);

  // ── Click-outside ────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as HTMLElement;
      if (triggerRef?.current?.contains(target)) return;
      if (target.closest('.atlas-dice-portal')) return;
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

  return (
    <>
      {/* Dropdown panel */}
      {isOpen &&
        createPortal(
          <div
            ref={portalRef}
            className={cn('atlas-dice-portal atlas-vtt-plugin', keepInView.capped && 'atlas-keep-in-view--capped')}
            style={{ ...keepInView.style, top: `${position.top}px`, left: `${position.left}px` }}
          >
            <div className="atlas-dice-panel">
              <DiceGrid selection={selection} onAdd={handleAdd} onRemove={handleRemove} />
              <DiceFormulaBar selection={selection} onClear={handleClear} onRoll={handleRoll} />
            </div>
          </div>,
          document.body,
        )}

      {/* Global toast layer — listens for atlas-dice-rolled CustomEvent */}
      {showToasts && <DiceToastContainer />}
    </>
  );
}
