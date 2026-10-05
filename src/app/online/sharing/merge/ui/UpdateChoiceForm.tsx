import React, { useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import type { UpdateChoice } from '../../receive/PulledItems';
import { LabelledCheck } from '../../ui/LabelledCheck';
import type { AskResult } from '../noteUpdate';
import { t } from '../../../../i18n';

const CHOICES: ReadonlyArray<{ choice: UpdateChoice; label: string }> = [
  { choice: 'both', label: t('share.merge.keepBoth') },
  { choice: 'mine', label: t('share.merge.keepMine') },
  { choice: 'theirs', label: t('share.merge.takeTheirs') },
  { choice: 'resolve', label: t('share.merge.resolve') },
  { choice: 'auto', label: t('share.merge.auto') },
];

export function UpdateChoiceForm({ title, personName, onAnswer }: { title: string; personName: string; onAnswer: (answer: AskResult) => void }): React.ReactElement {
  const [remember, setRemember] = useState(false);
  const [silent, setSilent] = useState(false);
  return (
    <div className="atlas-merge-choice">
      <h3 className="atlas-merge-choice__title">{t('share.merge.changedBothSides', { title })}</h3>
      <p className="atlas-merge-choice__help">{t('share.merge.changedHelp', { name: personName })}</p>
      <LabelledCheck label={t('share.merge.remember')} checked={remember} onChange={() => setRemember(!remember)} />
      <LabelledCheck label={t('share.merge.silent')} checked={silent} onChange={() => setSilent(!silent)} />
      <div className="modal-button-container atlas-merge-choice__actions">
        {CHOICES.map(({ choice, label }) => (
          <Button key={choice} variant={choice === 'resolve' ? 'default' : 'outline'} onClick={() => onAnswer({ choice, remember, silent })}>{label}</Button>
        ))}
      </div>
    </div>
  );
}
