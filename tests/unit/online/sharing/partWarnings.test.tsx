import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { partProblemsInNote, strayEndProblem } from '../../../../src/app/online/sharing/model/noteFilter';
import { pushRefusal } from '../../../../src/app/online/sharing/registerAskToPull';
import { OLD_CALLOUTS_WARNING, partError, partWarnings, UNCLOSED_COMMENT_WARNING } from '../../../../src/app/online/sharing/ui/partWarnings';
import { ShareWithForm } from '../../../../src/app/online/sharing/ui/ShareWithForm';

const STRAY = '---\ntags: [a]\n---\nOne\nTwo %%[!end]%%\nThree';

describe('a stray end blocks sharing the note (T-stray)', () => {
  it('Share with… shows an error naming the line', () => {
    const error = partError(partProblemsInNote(STRAY));
    expect(error).toBe(strayEndProblem(5));
    expect(error).toContain('line 5');
    render(<ShareWithForm rows={[]} initial={{ everyone: true, people: [], except: [] }} map={null} preview={null} warnings={[]} error={error!} onSave={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('line 5');
  });

  it('a push request for it is refused; a well-formed note is not', () => {
    expect(pushRefusal(STRAY)).toBe(strayEndProblem(5));
    expect(pushRefusal('One %%[!private]%%x%%[!end]%%')).toBeNull();
    expect(partError(partProblemsInNote('One %%[!private]%%x%%[!end]%%'))).toBeNull();
  });
});

describe('the sender’s warnings', () => {
  it('old callouts, other tag text and an unclosed comment each have their own warning (M9)', () => {
    expect(partWarnings(partProblemsInNote('a\n> [!private]\n> s'))).toEqual([OLD_CALLOUTS_WARNING]);
    const other = partWarnings(partProblemsInNote('see [!only|Ana] here'));
    expect(other).toHaveLength(1);
    expect(other[0]).toContain('reads like a part tag');
    expect(partWarnings(partProblemsInNote('a `%%` b\n%%[!private]%%x%%[!end]%%'))).toContain(UNCLOSED_COMMENT_WARNING);
    expect(partWarnings(partProblemsInNote('%%[!private]%%x%%[!end]%%'))).toEqual([]);
  });
});
