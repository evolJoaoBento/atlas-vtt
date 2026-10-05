import { t } from '../../i18n';

/** The GM's online play copy, shared by the panel, the toolbar, the palette and the eye button. */
export const ONLINE_SESSION_LABEL = t('online.sessionLabel');
export const START_SESSION_LABEL = t('online.startSession');
export const STOP_SESSION_LABEL = t('online.stopSession');
export const PRESENT_LABEL = t('online.present');
export const STOP_PRESENTING_LABEL = t('online.stopPresenting');
export const OPEN_PLAYER_WINDOW_LABEL = t('online.openPlayerWindow');
export const ONLINE_SECTION_TITLE = t('online.sectionTitle');
export const JOIN_SESSION_LABEL = t('online.joinSession');
export const SHARED_WITH_ME_BUTTON = t('online.sharedWithMe');
export const OBSIDIAN_PLAYER_LABEL = t('online.obsidianPlayer');
export const KNOWN_PERSON_MARK = t('online.knownPerson');
export const NEW_PERSON_MARK = t('online.newPerson');
/** `notMet`: the name is of someone you added by name, who has never joined (Link hands over what you prepared for them). */
export const sameNameWarning = (name: string, notMet = false): string => (notMet
  ? t('online.sameNameNotMet', { name })
  : t('online.sameName', { name }));
export const linkToLabel = (name: string): string => t('online.linkTo', { name });
export const PEOPLE_LABEL = t('online.people');
