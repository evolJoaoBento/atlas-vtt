import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import type { ConflictDefault } from '../../receive/PulledItems';
import type { MergeChunk } from '../diff3';
import { mergedText, type ConflictChoice } from '../mergeResult';
import type { MergeAnswer } from '../noteUpdate';
import { t } from '../../../../i18n';

interface MergeViewProps {
  chunks: readonly MergeChunk[];
  preview: string | null;
  conflictDefault: ConflictDefault;
  onSave: (answer: MergeAnswer) => void;
  onCancel: () => void;
  /** Tells the dialog whether the result was edited by hand, so closing it can ask first. */
  onEdited?: (edited: boolean) => void;
}

const CHOICE_LABEL: Record<ConflictChoice, string> = { mine: t('share.merge.keepMine'), theirs: t('share.merge.takeTheirs'), both: t('share.merge.keepBoth') };
const TAKEN: Record<'mine' | 'theirs' | 'both', string> = { mine: t('share.merge.keptFromMine'), theirs: t('share.merge.takenFromTheirs'), both: t('share.merge.changedAlike') };

function Lines({ lines }: { lines: readonly string[] }): React.ReactElement {
  return <pre className="atlas-merge__lines">{lines.join('\n') || ' '}</pre>;
}

/** Side by side per conflict, one-sided changes taken; the result follows the choices until edited by hand. */
export function MergeView({ chunks, preview, conflictDefault, onSave, onCancel, onEdited }: MergeViewProps): React.ReactElement {
  const [choices, setChoices] = useState<Array<ConflictChoice | undefined>>([]);
  const [nextDefault, setNextDefault] = useState<ConflictDefault>(conflictDefault);
  const [edited, setEdited] = useState<string | null>(preview);
  const generated = useMemo(() => mergedText(chunks, choices, conflictDefault), [chunks, choices, conflictDefault]);
  const result = edited ?? generated;
  // Typed changes are never thrown away by a click: the conflict buttons wait until the receiver discards them.
  const byHand = edited !== null && edited !== generated;
  useEffect(() => { onEdited?.(byHand); }, [byHand, onEdited]);
  let conflict = -1;
  return (
    <div className="atlas-merge">
      <div className="atlas-merge__chunks">
        {chunks.map((chunk, index) => {
          if (chunk.kind === 'same') return <Lines key={index} lines={chunk.lines} />;
          if (chunk.kind !== 'conflict') {
            return (
              <div key={index} className="atlas-merge__taken">
                <span className="atlas-merge__label">{TAKEN[chunk.kind]}</span>
                <Lines lines={chunk.lines} />
              </div>
            );
          }
          const at = ++conflict;
          const choose = (choice: ConflictChoice): void => {
            const next = [...choices];
            next[at] = choice;
            setChoices(next);
            setEdited(null);
          };
          return (
            <div key={index} className="atlas-merge__conflict" role="group" aria-label={t('share.merge.conflict', { number: String(at + 1) })}>
              <div className="atlas-merge__sides">
                <div className="atlas-merge__side"><span className="atlas-merge__label">{t('share.merge.mine')}</span><Lines lines={chunk.mine} /></div>
                <div className="atlas-merge__side"><span className="atlas-merge__label">{t('share.merge.base')}</span><Lines lines={chunk.base} /></div>
                <div className="atlas-merge__side"><span className="atlas-merge__label">{t('share.merge.theirs')}</span><Lines lines={chunk.theirs} /></div>
              </div>
              <div className="atlas-merge__choices">
                {(['mine', 'theirs', 'both'] as const).map((choice) => (
                  <Button key={choice} size="sm" disabled={byHand} variant={(choices[at] ?? conflictDefault) === choice ? 'default' : 'outline'} onClick={() => choose(choice)}>
                    {CHOICE_LABEL[choice]}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <label className="atlas-merge__result">
        <span className="atlas-merge__label">{t('share.merge.result')}</span>
        <textarea aria-label={t('share.merge.result')} value={result} onChange={(event) => setEdited(event.target.value)} rows={12} />
      </label>
      {byHand && (
        <div className="atlas-merge__edited">
          <span>{t('share.merge.editedResult')}</span>
          <Button size="sm" variant="outline" onClick={() => setEdited(null)}>{t('share.merge.discardEdits')}</Button>
        </div>
      )}
      <label className="atlas-merge__default">
        <span>{t('share.merge.nextDefault')}</span>
        <select className="dropdown" aria-label={t('share.merge.nextDefault')} value={nextDefault} onChange={(event) => setNextDefault(event.target.value as ConflictDefault)}>
          <option value="both">{t('share.merge.keepBoth')}</option>
          <option value="mine">{t('share.merge.keepMine')}</option>
          <option value="theirs">{t('share.merge.takeTheirs')}</option>
        </select>
      </label>
      <div className="modal-button-container">
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant="default" onClick={() => onSave({ text: result, conflictDefault: nextDefault })}>{t('share.merge.save')}</Button>
      </div>
    </div>
  );
}
