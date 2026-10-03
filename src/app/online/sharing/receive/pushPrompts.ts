/**
 * Push requests become prompts, one per sender and item, shown while the request is pending. A
 * push never writes anything: Not now only dismisses it, and Pull is the one way in, through
 * `pullPushed`, the same pull the receiver would start from the dialog.
 */
import { dismissPush, type PushRequest, type ShareSessionState } from '../shareSessionStore';
import type { PullOutcome } from './notePull';
import { shareErrorText } from './shareErrors';
import type { SharedWithMe } from './SharedWithMe';

export interface PushPromptDeps {
  show(push: PushRequest, personName: string, answer: (pull: boolean) => void): { hide(): void };
  service(): Pick<SharedWithMe, 'pullPushed'> | null;
  notify(text: string): void;
}

const keyOf = (push: Pick<PushRequest, 'from' | 'item'>): string => `${push.from}/${push.item}`;

/** A listener for `shareSessionStore`: prompts for new pushes, takes the prompt of a dismissed one down. */
export function pushPromptListener(deps: PushPromptDeps): (state: ShareSessionState) => void {
  const prompts = new Map<string, { hide(): void }>();
  const pulled = (outcome: PullOutcome): void => {
    if ('path' in outcome) deps.notify(`Pulled into ${outcome.path}`);
  };
  return (state) => {
    for (const push of state.pushes) {
      const key = keyOf(push);
      if (prompts.has(key)) continue;
      const name = state.people.find((person) => person.personId === push.from)?.name ?? 'Someone';
      prompts.set(key, deps.show(push, name, (pull) => {
        dismissPush(push.from, push.item);
        if (pull) void deps.service()?.pullPushed(push).then(pulled, (error: unknown) => deps.notify(shareErrorText(error)));
      }));
    }
    for (const [key, prompt] of [...prompts]) {
      if (state.pushes.some((push) => keyOf(push) === key)) continue;
      prompt.hide();
      prompts.delete(key);
    }
  };
}
