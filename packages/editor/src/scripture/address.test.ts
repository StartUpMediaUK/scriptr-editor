import { describe, expect, it } from 'vitest';

import {
  formatScriptureAddress,
  parseReferenceQuery,
  validateScriptureAddress,
} from './address.js';
import { testStructure } from './test-structure.js';

describe('Scripture address domain', () => {
  it('constructs a reference progressively from abbreviations', () => {
    expect(parseReferenceQuery('Ro', testStructure)).toMatchObject({
      stage: 'chapter',
      books: [{ id: 'ROM' }],
    });
    expect(parseReferenceQuery('Romans 8', testStructure)).toMatchObject({
      stage: 'verse',
      address: { book: 'ROM', chapter: 8 },
    });
    expect(parseReferenceQuery('Romans 8:28', testStructure)).toMatchObject({
      stage: 'range',
      address: { book: 'ROM', chapter: 8, verseStart: 28 },
    });
    expect(parseReferenceQuery('Romans 8:28-30', testStructure)).toMatchObject({
      stage: 'complete',
      address: { book: 'ROM', chapter: 8, verseStart: 28, verseEnd: 30 },
    });
  });

  it('rejects impossible chapters and ranges', () => {
    expect(parseReferenceQuery('Romans 99', testStructure).error).toBeTruthy();
    expect(
      validateScriptureAddress(
        { book: 'ROM', chapter: 8, verseStart: 30, verseEnd: 28 },
        testStructure,
      ),
    ).toMatchObject({ valid: false });
  });

  it('formats canonical IDs with localized structure labels', () => {
    expect(
      formatScriptureAddress(
        { book: 'ROM', chapter: 8, verseStart: 28, verseEnd: 30 },
        testStructure,
      ),
    ).toBe('Romans 8:28-30');
  });
});
