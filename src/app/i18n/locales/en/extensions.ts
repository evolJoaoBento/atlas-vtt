import type { Message } from '../../types';

/** Atlas's own texts around what other plugins add; the extensions' labels and titles are theirs and never translated. */
export const extensions = {
  'extensions.closePanel': 'Close {name}',
} as const satisfies Record<string, Message>;
