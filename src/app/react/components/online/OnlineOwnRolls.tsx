import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../../../utils/cn';
import { throwStyle } from '../../../dice3d/diceDisplay';
import { diceSceneToShow } from '../../../dice3d/rollPresentation';
import { warmDiceSounds } from '../../../dice3d/audio/diceSamples';
import { warmStages } from '../../../dice3d/stagePool';
import { canRunMapHotkeys } from '../../../keyboard/mapHotkeys';
import { DiceRollStack } from '../dice3d/DiceRollStack';
import { closeAllRolls, closeRoll, dismissRoll, pushRoll, type StackedRoll } from '../dice3d/rollStackState';
import { DiceToast } from '../dice/DiceToast';
import { DICE_TOAST_KNOT_PATHS, DICE_TOAST_KNOT_SYMBOL_ID } from '../dice/diceToastOrnament';
import { useDiceToasts } from '../dice/useDiceToasts';
import { useDiceDisplay } from '../../hooks/useDiceDisplay';
import { diceFontClass, useDiceLook } from '../../hooks/useDiceLook';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';

/**
 * The online scene's own rolls: each roll this player made, as Atlas's `DiceRollDisplay` shows the
 * GM's, thrown with the player's own dice settings (display, look) or as a result card. Other
 * people's rolls go only to the dice log. Fed by `remoteScene.ownRoll`, never by Atlas's document
 * dice event: the player's other maps listen to that one and would record the shared log. A roll
 * whose dice the log does not all list shows as a card, since its throw would be missing dice.
 */
export function OnlineOwnRolls(): React.ReactElement | null {
  const { app, view } = useAtlasUI();
  const ownRoll = useAtlasStore((state) => state.remoteScene?.ownRoll ?? null);
  const display = useDiceDisplay(app ?? undefined);
  const look = useDiceLook(app ?? undefined);
  const { toasts, addToast, dismissToast, dismissAllToasts } = useDiceToasts();
  const [rolls, setRolls] = useState<readonly StackedRoll[]>([]);
  // Mounting with a roll already in the store (a view rebuilt) throws nothing: that roll was shown.
  const shown = useRef<string | null>(ownRoll?.id ?? null);

  useEffect(() => {
    if (!ownRoll || ownRoll.id === shown.current) return;
    shown.current = ownRoll.id;
    const scene = ownRoll.unlistedDice ? null : diceSceneToShow(ownRoll, display);
    if (!scene) {
      addToast(ownRoll);
      return;
    }
    warmDiceSounds();
    setRolls((prev) => pushRoll(prev, { result: ownRoll, scene, style: throwStyle(display) }));
  }, [ownRoll, display, addToast]);

  useEffect(() => {
    if (display !== 'card') warmStages(view?.containerEl.doc ?? document);
  }, [display, view]);

  // Escape dismisses the rolls on screen, as on the GM's map.
  const showing = rolls.some((roll) => !roll.leaving) || toasts.some((toast) => toast.phase !== 'exiting');
  useEffect(() => {
    if (!showing) return;
    const win = view?.containerEl.win ?? window;
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !canRunMapHotkeys(e, view?.viewId)) return;
      e.preventDefault();
      e.stopPropagation();
      setRolls(closeAllRolls);
      dismissAllToasts();
    };
    win.addEventListener('keydown', handler, true);
    return (): void => win.removeEventListener('keydown', handler, true);
  }, [showing, view, dismissAllToasts]);

  const close = useCallback((id: string): void => setRolls((prev) => closeRoll(prev, id)), []);
  const dismiss = useCallback((id: string): void => setRolls((prev) => dismissRoll(prev, id)), []);

  if (toasts.length === 0 && rolls.length === 0) return null;
  return (
    <div className={cn('atlas-dice-rolls atlas-vtt-plugin', diceFontClass(look))}>
      {toasts.length > 0 && (
        <svg className="atlas-dice-rolls__defs" aria-hidden="true">
          <defs>
            <g id={DICE_TOAST_KNOT_SYMBOL_ID} fill="none" stroke="currentColor" strokeWidth="10">
              {DICE_TOAST_KNOT_PATHS.map((d, i) => <path key={i} d={d} />)}
            </g>
          </defs>
        </svg>
      )}
      <DiceRollStack rolls={rolls} muted={false} onClose={close} onDone={dismiss} />
      {toasts.map((toast) => (
        <DiceToast key={toast.id} result={toast.result} phase={toast.phase} onDismiss={() => dismissToast(toast.id)} />
      ))}
    </div>
  );
}
