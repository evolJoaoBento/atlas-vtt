import type { Message } from '../../types';

export const light = {
  'light.previewFailed': 'Could not play the sound preview',
  'light.configure': 'Configure light…',
  'light.delete': 'Delete light',
  'light.turnOn': 'Turn on',
  'light.turnOff': 'Turn off',
} as const satisfies Record<string, Message>;
