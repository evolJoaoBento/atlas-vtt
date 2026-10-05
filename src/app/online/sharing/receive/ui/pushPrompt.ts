import { showConfirmNotice } from '../../../ui/confirmNotice';
import type { PushRequest } from '../../shareSessionStore';
import { t } from '../../../../i18n';

/** "Ana asks you to pull Goblin cave." with Pull and Not now, until answered. Names are text, never HTML. */
export function showPushPrompt(push: PushRequest, personName: string, answer: (pull: boolean) => void): { hide(): void } {
  return showConfirmNotice({
    text: (line) => line.setText(t('share.received.asksToPull', { name: personName, title: push.title })),
    answers: [
      { label: t('share.received.pull'), cta: true, run: () => answer(true) },
      { label: t('share.received.notNow'), run: () => answer(false) },
    ],
  });
}
