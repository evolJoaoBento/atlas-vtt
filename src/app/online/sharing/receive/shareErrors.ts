import { ShareError } from '../transport/ShareNode';
import { t } from '../../../i18n';

const TEXT: Record<ShareError['reason'], string> = {
  'not-shared': t('share.error.notShared'),
  busy: t('share.error.busy'),
  'too-large': t('share.error.tooLarge'),
  gone: t('share.error.gone'),
  failed: t('share.error.failed'),
  timeout: t('share.error.timeout'),
};

export function shareErrorText(error: unknown): string {
  return error instanceof ShareError ? TEXT[error.reason] : t('share.error.generic');
}

/** What a failed pull tells the receiver; the error itself goes to the console, where its cause can be read. */
export function pullFailedText(error: unknown): string {
  console.error('[Atlas sharing] Pull failed:', error);
  return shareErrorText(error);
}
