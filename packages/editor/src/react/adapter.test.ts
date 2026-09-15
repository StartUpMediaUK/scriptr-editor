import { describe, expect, it } from 'vitest';

import { createDocumentCodec } from '../document/codec.js';
import type { CanonicalDocument, Reference } from '../document/types.js';
import { canonicalToEditorJson, editorJsonToCanonical } from './adapter.js';

const document: CanonicalDocument = {
  version: 2,
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
      address: { book: 'ROM', chapter: 8, verseStart: 28 },
      translationId: 'KJV',
    },
    {
      id: 'comparison',
      type: 'translationComparison',
      address: { book: 'ROM', chapter: 8, verseStart: 28 },
      translationIds: ['KJV', 'WEB'],
      layout: 'twoColumn',
    },
    {
      id: 'image',
      type: 'image',
      assetId: 'asset-1',
      src: 'https://example.com/image.jpg',
      alt: 'Open Bible',
      alignment: 'center',
      width: 1200,
      height: 800,
      caption: [{ type: 'text', text: 'Study notes' }],
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

  it('maps Scripture blocks to authored editor nodes', () => {
    const editorJson = canonicalToEditorJson(document);
    expect(editorJson.content?.at(-3)).toMatchObject({
      type: 'scriptureBlock',
      attrs: { blockType: 'scripture' },
    });
    expect(editorJson.content?.at(-2)).toMatchObject({
      type: 'scriptureBlock',
      attrs: { blockType: 'translationComparison' },
    });
    expect(editorJsonToCanonical(editorJson).content.slice(-3, -1)).toEqual(
      document.content.slice(-3, -1),
    );
  });

  it('maps images to an authored image node and round-trips them', () => {
    const editorJson = canonicalToEditorJson(document);
    expect(editorJson.content?.at(-1)).toMatchObject({
      type: 'imageBlock',
      attrs: { blockType: 'image' },
    });
    expect(editorJsonToCanonical(editorJson).content.at(-1)).toEqual(
      document.content.at(-1),
    );
  });

  it('round-trips nested columns and heading toggles as editable nodes', () => {
    const layouts: CanonicalDocument = {
      version: 2,
      content: [
        {
          id: 'columns',
          type: 'columns',
          columns: [
            {
              id: 'left',
              content: [
                {
                  id: 'left-text',
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Left column' }],
                },
              ],
            },
            {
              id: 'right',
              content: [
                {
                  id: 'right-text',
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Right column' }],
                },
              ],
            },
          ],
        },
        {
          id: 'toggle',
          type: 'toggle',
          headingLevel: 2,
          defaultOpen: true,
          summary: [{ type: 'text', text: 'A heading toggle' }],
          content: [
            {
              id: 'toggle-text',
              type: 'paragraph',
              content: [{ type: 'text', text: 'Toggle content' }],
            },
          ],
        },
      ],
    };

    const editorJson = canonicalToEditorJson(layouts);
    expect(editorJson.content?.[0]).toMatchObject({
      type: 'columns',
      content: [{ type: 'column' }, { type: 'column' }],
    });
    expect(editorJson.content?.[1]).toMatchObject({
      type: 'toggle',
      attrs: { headingLevel: 2, defaultOpen: true },
    });
    expect(editorJsonToCanonical(editorJson)).toEqual(layouts);
  });

  it('round-trips video, audio, and bookmark blocks through dedicated nodes', () => {
    const media: CanonicalDocument = {
      version: 2,
      content: [
        {
          id: 'video',
          type: 'video',
          assetId: 'video-asset',
          title: 'Teaching',
          caption: [{ type: 'text', text: 'A short teaching.' }],
        },
        {
          id: 'audio',
          type: 'audio',
          src: 'https://example.com/message.mp3',
          title: 'Message',
          transcript: [{ type: 'text', text: 'Transcript' }],
        },
        {
          id: 'bookmark',
          type: 'webBookmark',
          url: 'https://example.com/article',
          title: 'Further reading',
          siteName: 'Example',
        },
      ],
    };

    const editorJson = canonicalToEditorJson(media);
    expect(editorJson.content?.map((node) => node.type)).toEqual([
      'mediaBlock',
      'mediaBlock',
      'bookmarkBlock',
    ]);
    expect(editorJsonToCanonical(editorJson)).toEqual(media);
  });

  it('rejects malformed editor JSON', () => {
    expect(() => editorJsonToCanonical({ type: 'page', content: [] })).toThrow(
      'doc root',
    );
  });

  it('removes orphaned Reference data when its final anchor is deleted', () => {
    const references: Record<string, Reference> = {
      note: {
        id: 'note',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'A shallow note.' }],
          },
        ],
      },
    };
    const result = editorJsonToCanonical(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { id: 'paragraph' },
            content: [{ type: 'text', text: 'Anchor removed.' }],
          },
        ],
      },
      references,
    );
    expect(result.references).toBeUndefined();
  });

  it('drops pasted Reference anchors without their definitions', () => {
    const result = editorJsonToCanonical({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'paragraph' },
          content: [
            {
              type: 'text',
              text: 'Keep the text.',
              marks: [
                { type: 'referenceAnchor', attrs: { referenceId: 'missing' } },
              ],
            },
          ],
        },
      ],
    });
    expect(result.content[0]).toMatchObject({
      content: [{ type: 'text', text: 'Keep the text.' }],
    });
  });
});
