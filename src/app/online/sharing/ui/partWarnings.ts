/** What Share with… tells the sender about a note's part tags: warnings, and the error that stops it being shared. */
import { strayEndProblem } from '../model/noteFilter';
import type { PartProblems } from '../model/privateParts';
import { END_TAG } from '../model/privateTags';
import { t } from '../../../i18n';

const MAX_UNREADABLE_WARNINGS = 3;
export const OLD_CALLOUTS_WARNING = t('share.warn.oldCallouts');
export const TAG_IN_CODE_WARNING = t('share.warn.tagInCode');
export const UNCLOSED_COMMENT_WARNING = t('share.warn.unclosedComment');

export function partWarnings(problems: PartProblems): string[] {
  const { strayText } = problems;
  return [
    ...(problems.tagInCodeOrLink ? [TAG_IN_CODE_WARNING] : []),
    ...(strayText?.oldCallout ? [OLD_CALLOUTS_WARNING] : []),
    ...(strayText && !strayText.oldCallout
      ? [t('share.warn.stray', { text: strayText.text })]
      : []),
    ...[...new Set(problems.malformed)].slice(0, MAX_UNREADABLE_WARNINGS)
      .map((start) => t('share.warn.malformed', { tag: start })),
    ...(problems.unclosed ? [t('share.warn.unclosed', { tag: END_TAG })] : []),
    ...(problems.unclosedComment ? [UNCLOSED_COMMENT_WARNING] : []),
  ];
}

/** The reason the note is not shared at all, or null. */
export function partError(problems: PartProblems): string | null {
  const line = problems.strayEndLines[0];
  return line === undefined ? null : strayEndProblem(line);
}
