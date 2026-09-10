import { describe, expect, it } from 'vitest';

import type { CanonicalDocument } from './types.js';
import { findDocumentLocations } from './locations.js';

describe('findDocumentLocations', () => {
  it('returns stable block-relative text and Scripture locations', () => {
    const document: CanonicalDocument = {
      version: 2,
      content: [
        {
          id: 'p',
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'The Lamb',
              marks: [{ type: 'reference', referenceId: 'note' }],
            },
            { type: 'text', text: ' opens the seals.' },
          ],
        },
        {
          id: 's',
          type: 'scripture',
          address: { book: 'ROM', chapter: 8, verseStart: 28 },
          translationId: 'KJV',
        },
      ],
      references: {
        note: {
          id: 'note',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Christ is worthy.' }],
            },
          ],
        },
      },
    };
    expect(findDocumentLocations(document, 'Lamb')).toEqual([
      expect.objectContaining({
        blockId: 'p',
        kind: 'reference',
        offset: 4,
        length: 4,
        referenceId: 'note',
      }),
    ]);
    expect(findDocumentLocations(document, 'ROM 8:28')).toEqual([
      { blockId: 's', kind: 'scripture', context: 'ROM 8:28' },
    ]);
    expect(findDocumentLocations(document, 'worthy')).toEqual([
      expect.objectContaining({
        blockId: 'p',
        kind: 'reference',
        referenceId: 'note',
      }),
    ]);
  });
});
