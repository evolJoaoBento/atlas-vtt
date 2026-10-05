import { useState, useEffect, useCallback } from 'react';
import type { DiceRollResult } from '../../../tools/DiceTool';

const MAX_HISTORY = 20;

/**
 * Subscribes to dice roll events and provides a reactive history array.
 * Seeds from the store's persisted `diceLog` on mount, syncs new rolls
 * back to the store for persistence across map close/reopen.
 * @param options.listen - false: show only `storeActions.diceLog` (a remote view's shared log), never the document-wide dice event
 */
export function useDiceHistory(
  getDiceTool: () => { rollDice: (formula: string, source?: DiceRollResult['source']) => DiceRollResult } | null,
  storeActions?: {
    diceLog: DiceRollResult[];
    addDiceLogEntry: (entry: DiceRollResult) => void;
    clearDiceLog: () => void;
  },
  options: { listen?: boolean } = {},
): {
  history: DiceRollResult[];
  clearHistory: () => void;
  repeatRoll: (formula: string, source?: DiceRollResult['source']) => void;
} {
  const listen = options.listen !== false;
  const [history, setHistory] = useState<DiceRollResult[]>(() =>
    storeActions?.diceLog ?? [],
  );

  // Re-seed when store's diceLog changes (e.g. map switch / hydration)
  useEffect(() => {
    if (storeActions?.diceLog) {
      setHistory(storeActions.diceLog);
    }
  }, [storeActions?.diceLog]);

  // Listen for new rolls (DOM CustomEvent — same channel as toast system)
  useEffect(() => {
    if (!listen) return;
    const handleRoll = (e: Event): void => {
      const result = (e as CustomEvent<DiceRollResult>).detail;
      setHistory(prev => {
        const next = [result, ...prev];
        return next.length > MAX_HISTORY ? next.slice(0, MAX_HISTORY) : next;
      });
      // Persist to store so it survives map close/reopen
      storeActions?.addDiceLogEntry(result);
    };

    const handleClear = (): void => {
      setHistory([]);
    };

    document.addEventListener('atlas-dice-rolled', handleRoll);
    document.addEventListener('atlas-dice-history-cleared', handleClear);
    return () => {
      document.removeEventListener('atlas-dice-rolled', handleRoll);
      document.removeEventListener('atlas-dice-history-cleared', handleClear);
    };
  }, [storeActions, listen]);

  const clearHistory = useCallback((): void => {
    setHistory([]);
    storeActions?.clearDiceLog();
    document.dispatchEvent(new CustomEvent('atlas-dice-history-cleared'));
  }, [storeActions]);

  const repeatRoll = useCallback((formula: string, source?: DiceRollResult['source']): void => {
    const diceTool = getDiceTool();
    if (diceTool) {
      diceTool.rollDice(formula, source);
    }
  }, [getDiceTool]);

  return { history, clearHistory, repeatRoll };
}
