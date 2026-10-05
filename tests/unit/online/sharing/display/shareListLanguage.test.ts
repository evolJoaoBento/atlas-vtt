import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../../../../src/app/i18n';
import { listFor } from '../../../../../src/app/online/sharing/display/shareList';

afterEach(() => { setLocale('en'); });

describe('lists in sharing texts', () => {
  it('are joined in English while the sentence has no translation, so a Russian Atlas does not mix languages', () => {
    setLocale('ru');
    expect(listFor('share.summary.people', ['Ana', 'Ben', 'Cara'])).toBe('Ana, Ben, and Cara');
    // A sentence Russian translates joins the Russian way.
    expect(listFor('cleanup.confirm', ['A', 'B'])).toBe('A и B');
  });

  it('are joined in English in English', () => {
    expect(listFor('share.summary.people', ['Ana', 'Ben'])).toBe('Ana and Ben');
  });
});
