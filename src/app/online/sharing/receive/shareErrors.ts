import { ShareError } from '../transport/ShareNode';

const TEXT: Record<ShareError['reason'], string> = {
  'not-shared': 'That is not shared with you any more.',
  busy: 'They are sending a lot right now. Try again in a moment.',
  'too-large': 'That item is too large to share.',
  gone: 'They are not in the session any more.',
  failed: 'The item arrived damaged. Try again.',
  timeout: 'They did not answer. Try again.',
};

export function shareErrorText(error: unknown): string {
  return error instanceof ShareError ? TEXT[error.reason] : 'Could not pull that item.';
}
