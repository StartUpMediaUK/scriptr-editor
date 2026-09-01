import { describe, expect, it } from 'vitest';

import { createDocumentCodec } from '../document/codec.js';
import type { CanonicalDocument } from '../document/types.js';
import { canonicalToEditorJson, editorJsonToCanonical } from './adapter.js';

const document: CanonicalDocument = {
  version: 1,
  content: [
    {
      id: 'heading',
      type: 'heading',
      level: 2,
      content: [{ type: 'text', text: 'Sequence, or unveiling' }],
    },
    {
      id: 'paragraph',
      type: 'paragraph',
      content: [
        { type: 'text', text: 'The Lamb ', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'opens the seals.' },
      ],
    },
    {
      id: 'checklist',
      type: 'list',
      kind: 'check',
      items: [
        {
          id: 'check-1',
          checked: false,
          content: [{ type: 'text', text: 'Compare translations' }],
          children: [
            {
              id: 'check-1-1',
              checked: true,
              content: [{ type: 'text', text: 'Read KJV' }],
            },
          ],
        },
      ],
    },
    {
      id: 'callout',
      type: 'callout',
      tone: 'note',
      content: [{ type: 'text', text: 'Christ is worthy.' }],
    },
    {
      id: 'divider',
      type: 'divider',
    },
    {
      id: 'scripture',
      type: 'scripture',
      address: { book: 'REV', chapter: 6, verseStart: 1 },
      translationId: 'KJV',
    },
  ],
};

describe('canonical editor adapter', () => {
  it('does not transform an ordinary typed Bible reference', () => {
    const canonical = editorJsonToCanonical({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'plain-reference' },
          content: [{ type: 'text', text: 'Romans 8:28' }],
        },
      ],
    });

    expect(canonical.content[0]).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Romans 8:28' }],
    });
  });
  it('round-trips baseline blocks without engine data leaking into the document', () => {
    const editorJson = canonicalToEditorJson(document);
    const roundTrip = editorJsonToCanonical(editorJson);

    expect(roundTrip).toEqual(createDocumentCodec().parse(document));
    expect(JSON.stringify(roundTrip)).not.toContain('ProseMirror');
  });

  it('preserves out-of-phase canonical blocks as opaque portable nodes', () => {
    const editorJson = canonicalToEditorJson(document);
    expect(editorJson.content?.at(-1)).toMatchObject({
      type: 'portableBlock',
      attrs: { blockType: 'scripture' },
    });
    expect(editorJsonToCanonical(editorJson).content.at(-1)).toEqual(
      document.content.at(-1),
    );
  });

  it('rejects malformed editor JSON', () => {
    expect(() => editorJsonToCanonical({ type: 'page', content: [] })).toThrow(
      'doc root',
    );
  });
});
