import React, { useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import type { PeopleBook } from '../PeopleBook';
import { t } from '../../../../i18n';

export const ADD_PERSON_HINT = t('people.addHint');

/** A name field and Add: the person is kept as someone not met yet. A taken or invalid name is explained, never changed. */
export function AddPersonForm({ people }: { people: Pick<PeopleBook, 'addPlaceholder'> }): React.ReactElement {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const add = (): void => {
    if (!name.trim()) return;
    const result = people.addPlaceholder(name);
    setProblem(result);
    if (!result) setName('');
  };
  return (
    <div className="atlas-people__add">
      <div className="atlas-people__row">
        <input
          className="atlas-people__name"
          value={name}
          placeholder={t('people.addPlaceholder')}
          aria-label={t('people.addLabel')}
          onChange={(event) => { setName(event.target.value); setProblem(null); }}
          onKeyDown={(event) => { if (event.key === 'Enter') add(); }}
        />
        <Button variant="default" onClick={add} disabled={!name.trim()}>{t('people.add')}</Button>
      </div>
      <span className="atlas-people__hint">{ADD_PERSON_HINT}</span>
      {problem && <span className="atlas-people__problem" role="alert">{problem}</span>}
    </div>
  );
}
