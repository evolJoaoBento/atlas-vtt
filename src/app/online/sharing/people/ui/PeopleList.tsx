import React, { useCallback, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { PeopleBook } from '../PeopleBook';
import { GM_PERSON_ID, keyOf, type Person } from '../peopleTypes';

export const NO_PEOPLE_TEXT = 'Nobody yet. People are added when you let them into your session or join someone else’s.';

interface PeopleListProps {
  people: Pick<PeopleBook, 'list' | 'rename' | 'merge' | 'remove' | 'subscribe'>;
  /** This Atlas's own table, shown as "Your table". */
  ownTableId: string | null;
  confirmRemove: (person: Person) => Promise<boolean>;
}

/** The heading of a table's group: yours, or the GM's name at theirs. */
function tableTitle(tableId: string, people: readonly Person[], ownTableId: string | null): string {
  if (tableId === ownTableId) return 'Your table';
  const gm = people.find((person) => person.tableId === tableId && person.personId === GM_PERSON_ID);
  return gm ? `${gm.name}’s table` : 'Another table';
}

function lastSeenText(time: number): string {
  return time > 0 ? `Last seen ${new Date(time).toLocaleDateString()}` : 'Not seen yet';
}

function PersonRow({ person, others, people, confirmRemove }: {
  person: Person; others: readonly Person[]; people: PeopleListProps['people']; confirmRemove: PeopleListProps['confirmRemove'];
}): React.ReactElement {
  const [name, setName] = useState(person.name);
  const [problem, setProblem] = useState<string | null>(null);
  const commit = (): void => {
    if (name.trim() === person.name) {
      setName(person.name);
      setProblem(null);
      return;
    }
    const result = people.rename(keyOf(person), name);
    setProblem(result);
    if (!result) setName(name.trim());
  };
  return (
    <li className="atlas-people__person">
      <div className="atlas-people__row">
        <input
          className="atlas-people__name"
          value={name}
          aria-label={`Name of ${person.name}`}
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === 'Enter') commit(); }}
        />
        <select
          className="atlas-people__link dropdown"
          aria-label={`Link ${person.name} to`}
          value=""
          onChange={(event) => { if (event.target.value) setProblem(people.merge(keyOf(person), event.target.value)); }}
        >
          <option value="">Link to…</option>
          {others.map((other) => <option key={keyOf(other)} value={keyOf(other)}>{other.name}</option>)}
        </select>
        <LabelTooltip label={`Remove ${person.name}`}>
          <Button
            variant="ghost" size="icon" aria-label={`Remove ${person.name}`}
            onClick={() => { void confirmRemove(person).then((yes) => { if (yes) people.remove(keyOf(person)); }); }}
          >
            <X />
          </Button>
        </LabelTooltip>
      </div>
      <span className="atlas-people__seen">{lastSeenText(person.lastSeen)}</span>
      {problem && <span className="atlas-people__problem" role="alert">{problem}</span>}
    </li>
  );
}

/** Everyone this Atlas knows, by table: rename, link one person into another, remove. */
export function PeopleList({ people, ownTableId, confirmRemove }: PeopleListProps): React.ReactElement {
  // `list()` returns the same array until a change, as `useSyncExternalStore` requires.
  const subscribe = useCallback((onChange: () => void) => people.subscribe(onChange), [people]);
  const list = useSyncExternalStore(subscribe, () => people.list());
  if (list.length === 0) return <p className="atlas-people__empty">{NO_PEOPLE_TEXT}</p>;
  const tables = [...new Set(list.map((person) => person.tableId))];
  return (
    <div className="atlas-people">
      {tables.map((tableId) => (
        <section key={tableId} className="atlas-people__table" aria-label={tableTitle(tableId, list, ownTableId)}>
          <h3 className="atlas-people__heading">{tableTitle(tableId, list, ownTableId)}</h3>
          <ul className="atlas-people__list">
            {list.filter((person) => person.tableId === tableId).map((person) => (
              <PersonRow key={keyOf(person)} person={person} others={list.filter((other) => other !== person)} people={people} confirmRemove={confirmRemove} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
