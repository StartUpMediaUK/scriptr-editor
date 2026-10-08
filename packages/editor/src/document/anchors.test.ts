import { describe, expect, it } from 'vitest';
import {
  documentTextRegions,
  resolveDocumentAnchor,
  remapDocumentAnchor,
} from './anchors.js';
import type { CanonicalDocument } from './types.js';

const document: CanonicalDocument = {
  version: 2,
  content: [
    {
      id: 'toggle',
      type: 'toggle',
      summary: [{ type: 'text', text: 'Summary' }],
      content: [
        {
          id: 'list',
          type: 'list',
          kind: 'bullet',
          items: [
            {
              id: 'first',
              content: [{ type: 'text', text: 'One' }],
              children: [
                { id: 'nested', content: [{ type: 'text', text: 'Two' }] },
              ],
            },
          ],
        },
        {
          id: 'columns',
          type: 'columns',
          columns: [
            {
              id: 'column-a',
              content: [
                {
                  id: 'p',
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'A' },
                    { type: 'hardBreak' },
                    { type: 'text', text: 'B' },
                  ],
                },
              ],
            },
            {
              id: 'column-b',
              content: [
                {
                  id: 'scripture',
                  type: 'scripture',
                  address: { book: 'ROM', chapter: 8, verseStart: 28 },
                  translationId: 'example',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('portable authored-content anchors', () => {
  it('maps explicit migration identities and refuses missing identities', () => {
    const anchor = {
      blockId: 'old-list',
      itemId: 'old-item',
      field: 'content' as const,
      offset: 1,
      length: 2,
    };
    expect(remapDocumentAnchor(document, anchor)).toBeUndefined();
    expect(
      remapDocumentAnchor(document, anchor, {
        blocks: { 'old-list': 'list' },
        items: { 'old-item': 'nested' },
      }),
    ).toEqual({ ...anchor, blockId: 'list', itemId: 'nested' });
  });
  it('uses list item identity and separate nested text regions', () => {
    expect(
      documentTextRegions(document).map((region) => [
        region.blockId,
        region.itemId,
        region.field,
        region.text,
      ]),
    ).toEqual([
      ['toggle', undefined, 'summary', 'Summary'],
      ['list', 'first', 'content', 'One'],
      ['list', 'nested', 'content', 'Two'],
      ['p', undefined, 'content', 'A\nB'],
    ]);
  });
  it('resolves nested positions without confusing sibling text', () => {
    const anchor = {
      blockId: 'list',
      itemId: 'nested',
      field: 'content' as const,
      offset: 1,
      length: 2,
    };
    expect(resolveDocumentAnchor(document, anchor)).toBe(anchor);
    expect(
      resolveDocumentAnchor(document, { ...anchor, itemId: 'absent' }),
    ).toBeUndefined();
  });
  it('validates migrated/reloaded anchors and returns unresolved positions explicitly', () => {
    expect(
      resolveDocumentAnchor(document, {
        blockId: 'p',
        field: 'content',
        offset: 3,
        length: 0,
      }),
    ).toBeDefined();
    expect(
      resolveDocumentAnchor(document, {
        blockId: 'p',
        field: 'content',
        offset: 3,
        length: 1,
      }),
    ).toBeUndefined();
    expect(
      resolveDocumentAnchor(document, {
        blockId: 'p',
        field: 'content',
        offset: -1,
        length: 0,
      }),
    ).toBeUndefined();
    expect(
      resolveDocumentAnchor(document, {
        blockId: 'scripture',
        field: 'block',
        offset: 0,
        length: 0,
      }),
    ).toBeDefined();
  });
});
