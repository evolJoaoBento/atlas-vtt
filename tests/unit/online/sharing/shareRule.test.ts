import { describe, expect, it } from 'vitest';
import { calloutAllows, ruleReaches } from '../../../../src/app/online/sharing/model/audience';
import { formatShareRule, parseShareRule, unknownRuleNames } from '../../../../src/app/online/sharing/model/shareRule';
import type { Person } from '../../../../src/app/online/sharing/people/peopleTypes';

const T = 'T'.repeat(43);
const person = (personId: string, name: string, extra: Partial<Person> = {}): Person =>
  ({ tableId: T, personId, name, formerNames: [], devices: [], aliases: [], lastSeen: 0, ...extra });
const ana = person('ana', 'Ana', { formerNames: ['Annie'] });
const ben = person('ben', 'Ben');
const cara = person('cara', 'Cara');
const people = { byName: (name: string): Person | null => [ana, ben, cara].find((p) => p.name === name || p.formerNames.includes(name)) ?? null };
const as = (p: Person): { tableId: string; personId: string } => ({ tableId: p.tableId, personId: p.personId });

describe('atlas-share', () => {
  it('reads every form of the spec', () => {
    expect(parseShareRule('public')).toEqual({ private: false, public: true, only: [], except: [] });
    expect(parseShareRule('private')).toMatchObject({ private: true });
    expect(parseShareRule(undefined)).toEqual({ private: false, public: false, only: [], except: [] });
    expect(parseShareRule(['Ana', 'Ben'])).toMatchObject({ only: ['Ana', 'Ben'] });
    expect(parseShareRule(['only Ana', 'ONLY Ben'])).toMatchObject({ only: ['Ana', 'Ben'] });
    expect(parseShareRule(['public', 'except Cara'])).toMatchObject({ public: true, except: ['Cara'] });
    expect(parseShareRule('Ana, Ben')).toMatchObject({ only: ['Ana', 'Ben'] });
    expect(parseShareRule([7, '  ', 'Ana'])).toMatchObject({ only: ['Ana'] });
  });

  it('decides who it reaches: private wins over everything, except over a name, unknown except reaches nobody', () => {
    expect(ruleReaches(parseShareRule('public'), as(cara), people)).toBe(true);
    expect(ruleReaches(parseShareRule(['Ana', 'Ben']), as(ana), people)).toBe(true);
    expect(ruleReaches(parseShareRule(['Ana', 'Ben']), as(cara), people)).toBe(false);
    expect(ruleReaches(parseShareRule(['public', 'except Cara']), as(cara), people)).toBe(false);
    expect(ruleReaches(parseShareRule(['public', 'except Cara']), as(ben), people)).toBe(true);
    expect(ruleReaches(parseShareRule(['Ana', 'except Ana']), as(ana), people)).toBe(false);
    expect(ruleReaches(parseShareRule(['public', 'private']), as(ana), people)).toBe(false);
    expect(ruleReaches(parseShareRule(['public', 'except Zed']), as(ana), people)).toBe(false);
    expect(ruleReaches(parseShareRule('Annie'), as(ana), people)).toBe(true); // a former name still reaches her
    expect(ruleReaches(parseShareRule('Ana'), { tableId: 'U'.repeat(43), personId: 'ana' }, people)).toBe(false); // another table
    expect(unknownRuleNames(parseShareRule(['Ana', 'except Zed', 'Yan']), people)).toEqual(['Yan', 'Zed']);
  });

  it('writes what the dialog chose', () => {
    expect(formatShareRule({ everyone: true, people: [], except: [] })).toBe('public');
    expect(formatShareRule({ everyone: true, people: ['Ana'], except: ['Cara'] })).toEqual(['public', 'except Cara']);
    expect(formatShareRule({ everyone: false, people: ['Ana', 'Ben'], except: ['Cara'] })).toEqual(['Ana', 'Ben']);
    expect(formatShareRule({ everyone: false, people: [], except: [] })).toBeNull();
  });

  it('checks callouts: private never, only those, except all but those, unknown names fail closed', () => {
    expect(calloutAllows({ kind: 'private' }, as(ana), people)).toBe(false);
    expect(calloutAllows({ kind: 'only', names: ['Ana', 'Zed'] }, as(ana), people)).toBe(true);
    expect(calloutAllows({ kind: 'only', names: ['Zed'] }, as(ana), people)).toBe(false);
    expect(calloutAllows({ kind: 'except', names: ['Cara'] }, as(ana), people)).toBe(true);
    expect(calloutAllows({ kind: 'except', names: ['Cara'] }, as(cara), people)).toBe(false);
    expect(calloutAllows({ kind: 'except', names: ['Zed'] }, as(ana), people)).toBe(false);
  });
});
