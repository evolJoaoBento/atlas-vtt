import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../../packages/components/primitives/button';
import type { PushRequest, SessionPerson } from '../../shareSessionStore';
import { LabelledCheck } from '../../ui/LabelledCheck';
import { pullAcceptedPush } from '../pushPrompts';
import { pullFailedText, shareErrorText } from '../shareErrors';
import type { ItemState, ListedItem, SharedWithMe } from '../SharedWithMe';
import { t } from '../../../../i18n';

export const NOTHING_SHARED_TEXT = t('share.received.nothing');
const STATE_TEXT: Record<ItemState, string> = { new: t('share.received.new'), updated: t('share.received.updated'), current: t('share.received.current') };

type Service = Pick<SharedWithMe, 'refresh' | 'pull' | 'pullPushed'>;

interface ListProps {
  service: Service;
  people: readonly SessionPerson[];
  pushes: readonly PushRequest[];
  dismissPush: (push: PushRequest) => void;
  onPulled: (path: string) => void;
  onProblem: (text: string) => void;
}

function ItemRow({ item, onPull, titles }: { item: ListedItem; onPull: (linked: string[]) => Promise<void>; titles: ReadonlyMap<string, string> }): React.ReactElement {
  const [linked, setLinked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pull = (): void => {
    setBusy(true);
    setProblem(null);
    onPull(linked).catch((error: unknown) => setProblem(pullFailedText(error))).finally(() => setBusy(false));
  };
  const toggle = (id: string): void => setLinked(linked.includes(id) ? linked.filter((other) => other !== id) : [...linked, id]);
  return (
    <li className="atlas-shared__item">
      <div className="atlas-shared__row">
        <span className="atlas-shared__title">{item.title}</span>
        {item.kind === 'map' && <span className="atlas-shared__kind">{item.mode === 'full' ? t('share.received.mapFull') : t('share.received.map')}</span>}
        <span className={`atlas-shared__state atlas-shared__state--${item.state}`}>{STATE_TEXT[item.state]}</span>
        <Button variant={item.state === 'current' ? 'outline' : 'default'} size="sm" disabled={busy} onClick={pull}>
          {item.state === 'updated' ? t('share.received.pullUpdate') : t('share.received.pull')}
        </Button>
      </div>
      {item.kind === 'map' && (item.linked ?? []).length > 0 && (
        <ul className="atlas-shared__linked" aria-label={t('share.received.linkedNotesOf', { title: item.title })}>
          {(item.linked ?? []).map((id) => (
            <li key={id}>
              <LabelledCheck label={titles.has(id) ? t('share.received.alsoPull', { title: titles.get(id) ?? '' }) : t('share.received.alsoPullLinked')} checked={linked.includes(id)} onChange={() => toggle(id)} />
            </li>
          ))}
        </ul>
      )}
      {problem && <span className="atlas-shared__problem" role="alert">{problem}</span>}
    </li>
  );
}

function PersonSection({ person, service, onPulled }: { person: SessionPerson; service: Service; onPulled: (path: string) => void }): React.ReactElement {
  const [items, setItems] = useState<ListedItem[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const load = useCallback((): void => {
    service.refresh(person.personId).then((catalogue) => setItems(catalogue.items), (error: unknown) => setProblem(shareErrorText(error)));
  }, [person.personId, service]);
  useEffect(() => { load(); }, [load]);
  const titles = new Map((items ?? []).map((item) => [item.item, item.title]));
  return (
    <section className="atlas-shared__person" aria-label={person.name}>
      <h3 className="atlas-shared__heading">{person.name}</h3>
      {problem && <p className="atlas-shared__problem" role="alert">{problem}</p>}
      {items === null && !problem && <p className="atlas-shared__help">{t('share.received.asking', { name: person.name })}</p>}
      {items?.length === 0 && <p className="atlas-shared__help">{NOTHING_SHARED_TEXT}</p>}
      <ul className="atlas-shared__items">
        {items?.map((item) => (
          <ItemRow key={item.item} item={item} titles={titles} onPull={async (linked) => {
            const outcome = await service.pull(person.personId, item, linked);
            if ('path' in outcome) onPulled(outcome.path);
            load();
          }} />
        ))}
      </ul>
    </section>
  );
}

/** Push requests first, then everyone in the session with what they share. */
export function SharedWithMeList({ service, people, pushes, dismissPush, onPulled, onProblem }: ListProps): React.ReactElement {
  const nameOf = (personId: string): string => people.find((person) => person.personId === personId)?.name ?? t('share.someone');
  return (
    <div className="atlas-shared">
      {pushes.length > 0 && (
        <section className="atlas-shared__person" aria-label={t('share.received.askedToPull')}>
          <h3 className="atlas-shared__heading">{t('share.received.askedToPull')}</h3>
          <ul className="atlas-shared__items">
            {pushes.map((push) => (
              <li key={`${push.from}/${push.item}`} className="atlas-shared__row">
                <span className="atlas-shared__title">{t('share.received.asksToPull', { name: nameOf(push.from), title: push.title })}</span>
                <Button variant="default" size="sm" onClick={() => {
                  dismissPush(push);
                  pullAcceptedPush(service, push, { pulled: onPulled, failed: onProblem });
                }}>{t('share.received.pull')}</Button>
                <Button variant="outline" size="sm" onClick={() => dismissPush(push)}>{t('share.received.notNow')}</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {people.length === 0 && <p className="atlas-shared__help">{t('share.received.nobodyShares')}</p>}
      {people.map((person) => <PersonSection key={person.personId} person={person} service={service} onPulled={onPulled} />)}
    </div>
  );
}
