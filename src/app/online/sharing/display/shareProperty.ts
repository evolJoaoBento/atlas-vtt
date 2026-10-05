/**
 * What the `atlas-share` property says, as labels in the colours of the share tags, and in one line who it
 * reaches. Every entry is read by the filter's own parser (`parseShareRule`) and every name through the
 * people list, the way `audience.ruleReaches` reads them, so the labels never disagree with what is shared.
 */
import type { NameResolver } from '../model/audience';
import { parseShareRule } from '../model/shareRule';
import type { TagTone } from './tagDisplay';
import { t } from '../../../i18n';
import { listFor } from './shareList';

/** `not-met`: a name added before meeting them. `unrecognised`: an entry Atlas cannot read, or a name it does not know. */
export type ShareEntryStatus = 'ok' | 'not-met' | 'unrecognised';

export interface ShareEntryLabel {
  tone: TagTone;
  text: string;
  status: ShareEntryStatus;
  /** Why it is not plain (shown under the property); null when it is. */
  reason: string | null;
}

/** One entry of the property: `entry` is its text when it is a string (a list pill shows that text). */
export interface ShareItemView {
  entry: string | null;
  labels: ShareEntryLabel[];
}

export interface SharePropertyView {
  items: ShareItemView[];
  /** "Shared with: everyone except Dave". */
  summary: string;
}

export const UNRECOGNISED_LABEL = t('share.notRecognised');
export const NOT_MET = t('share.notMet');

const known = (name: string, people: NameResolver, every: boolean): boolean =>
  (every && people.allByName ? people.allByName(name).length : people.byName(name) ? 1 : 0) > 0;

function nameLabel(kind: 'only' | 'except', name: string, people: NameResolver): ShareEntryLabel {
  const text = t(kind === 'only' ? 'share.only' : 'share.except', { names: name });
  if (known(name, people, kind === 'except')) return { tone: kind, text, status: 'ok', reason: null };
  if (people.isPlaceholder?.(name)) {
    const reason = kind === 'only'
      ? t('share.reason.onlyNotMet', { name })
      : t('share.reason.exceptNotMet', { name });
    return { tone: kind, text: t(kind === 'only' ? 'share.onlyNotMet' : 'share.exceptNotMet', { name }), status: 'not-met', reason };
  }
  const reason = t(kind === 'only' ? 'share.reason.onlyUnknown' : 'share.reason.exceptUnknown', { name });
  return { tone: 'private', text, status: 'unrecognised', reason };
}

/** The labels of one entry of the property (a list item, or the whole value when it is not a list). */
export function shareItemLabels(item: unknown, people: NameResolver): ShareEntryLabel[] {
  const rule = parseShareRule(item);
  if (rule.unreadable) {
    return [{ tone: 'private', text: UNRECOGNISED_LABEL, status: 'unrecognised', reason: t('share.reason.unreadable') }];
  }
  return [
    ...(rule.private ? [{ tone: 'private' as const, text: t('share.private'), status: 'ok' as const, reason: null }] : []),
    ...(rule.public ? [{ tone: 'public' as const, text: t('share.public'), status: 'ok' as const, reason: null }] : []),
    ...rule.only.map((name) => nameLabel('only', name, people)),
    ...rule.except.map((name) => nameLabel('except', name, people)),
  ];
}


/** Who the whole value reaches, in the order `ruleReaches` decides it. */
export function shareSummary(value: unknown, people: NameResolver): string {
  const rule = parseShareRule(value);
  if (rule.unreadable) return t('share.summary.unreadable');
  if (rule.private) return t('share.summary.private');
  const blocking = rule.except.filter((name) => !known(name, people, true));
  if (blocking.length > 0) return t('share.summary.blocked', { count: blocking.length, names: listFor('share.summary.blocked', blocking) });
  if (rule.public) return rule.except.length > 0 ? t('share.summary.everyoneExcept', { names: listFor('share.summary.everyoneExcept', rule.except) }) : t('share.summary.everyone');
  const excepted = (name: string): boolean => rule.except.some((other) => other.toLowerCase() === name.toLowerCase());
  const reached = rule.only.filter((name) => known(name, people, false) && !excepted(name));
  if (reached.length > 0) return t('share.summary.people', { names: listFor('share.summary.people', reached) });
  return rule.except.length > 0 && rule.only.length === 0 ? t('share.summary.nobodyAddPublic') : t('share.summary.nobody');
}

/** The property's entries with their labels, and its summary. */
export function sharePropertyView(value: unknown, people: NameResolver): SharePropertyView {
  const items = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
  return {
    items: items.map((item: unknown) => ({ entry: typeof item === 'string' ? item : null, labels: shareItemLabels(item, people) })),
    summary: shareSummary(value, people),
  };
}
