import { Notice } from 'obsidian';
import type { SessionPlayer } from '../GmSession';
import type { JoinIdentity } from '../sharing/people/IdentityDesk';
import { KNOWN_PERSON_MARK, NEW_PERSON_MARK, linkToLabel, sameNameWarning } from './onlineCopy';

/** Who a waiting player is, and the Link answer when a new device uses a known name. */
export interface JoinRequestInfo {
  identity: JoinIdentity | null;
  link: (() => void) | null;
}

/**
 * "Anna wants to join your online session. (new)", with Allow, Link to Anna and Deny, until
 * answered or hidden. Names are text, never HTML.
 */
export function showJoinRequestNotice(player: SessionPlayer, answer: (allow: boolean) => void, info?: JoinRequestInfo): { hide(): void } {
  const fragment = createFragment();
  const body = fragment.createDiv({ cls: 'atlas-online-request' });
  const text = body.createDiv({ cls: 'atlas-online-request__text' });
  text.appendText(`${player.name} wants to join your online session.`);
  const identity = info?.identity ?? null;
  if (identity) text.createSpan({ cls: 'atlas-online-request__mark', text: ` ${identity.kind === 'known' ? KNOWN_PERSON_MARK : NEW_PERSON_MARK}` });
  const sameName = identity?.kind === 'new' ? identity.sameName : null;
  if (sameName) body.createDiv({ cls: 'atlas-online-request__warning', text: sameNameWarning(sameName.name) });
  const actions = body.createDiv({ cls: 'atlas-online-request__actions' });
  const notice = new Notice(fragment, 0);
  // Obsidian hides a notice on any click: only the answers may close this one.
  body.addEventListener('click', (event) => event.stopPropagation());
  const reply = (act: () => void) => (event: MouseEvent): void => {
    event.stopPropagation();
    act();
    notice.hide();
  };
  actions.createEl('button', { cls: 'mod-cta', text: 'Allow' }).addEventListener('click', reply(() => answer(true)));
  const link = info?.link ?? null;
  if (sameName && link) actions.createEl('button', { text: linkToLabel(sameName.name) }).addEventListener('click', reply(link));
  actions.createEl('button', { text: 'Deny' }).addEventListener('click', reply(() => answer(false)));
  return { hide: () => notice.hide() };
}
