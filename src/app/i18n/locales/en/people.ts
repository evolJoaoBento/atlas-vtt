import type { Message } from '../../types';

/** The people Atlas knows from online sessions, and people added by name before they are met. */
export const people = {
  'people.nameProblem': 'Enter a name of up to 40 characters.',
  'people.nameTaken': 'Someone in your people list is already called {name}.',
  'people.pickAnother': 'Pick another person.',
  'people.tooMany': 'You can add up to {max} people by name.',
  'people.notMet': 'Not met yet',
  'people.notMetExcept': 'Not met yet: hides the part from everyone until linked',
  'people.addHint': 'Add someone by name before you meet them, to prepare notes and shares. They reach nothing until you link them to the person who joins.',
  'people.addPlaceholder': 'Add a person by name',
  'people.addLabel': 'Name of the person to add',
  'people.add': 'Add',
  'people.none': 'Nobody yet. People are added when you let them into your session or join someone else’s.',
  'people.yourTable': 'Your table',
  'people.gmTable': '{name}’s table',
  'people.anotherTable': 'Another table',
  'people.lastSeen': 'Last seen {date}',
  'people.notSeen': 'Not seen yet',
  'people.nameOf': 'Name of {name}',
  'people.linkTo': 'Link {name} to',
  'people.linkToMenu': 'Link to…',
  'people.remove': 'Remove {name}',
  'people.removeTitle': 'Remove {name}?',
  'people.removePlaceholderMessage': 'Notes and shares that name them reach nobody, and nobody else can take the name.',
  'people.removePersonMessage': 'They join as new next time, and what you share with them by name stops reaching them.',
} as const satisfies Record<string, Message>;
