import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineExtension } from '../extensions/types.js';
import { createDocumentCodec, DocumentValidationError } from './codec.js';
import { extractInternalDocumentLinks } from './links.js';
import { migrateDocument } from './migrations.js';
import type { CanonicalDocument } from './types.js';

const fixtureSource = readFileSync(
  new URL('./__fixtures__/canonical-v1.json', import.meta.url),
  'utf8',
);
const fixture: unknown = JSON.parse(fixtureSource);

const prayerExtension = defineExtension({
  name: 'uk.startupmedia.example.prayer',
  version: 1,
  dataSchema: z.object({ label: z.string(), body: z.string() }),
  renderEditable: (data) =>
    `<aside data-editable>${data.label}: ${data.body}</aside>`,
  renderReadonly: (data) => `<aside>${data.label}: ${data.body}</aside>`,
});

describe('canonical document codec', () => {
  it('round-trips a representative v1 document deterministically', () => {
    const codec = createDocumentCodec({ extensions: [prayerExtension] });
    const document = codec.parse(fixture);
    const first = codec.serialize(document);
    const second = codec.serialize(codec.deserialize(first));

    expect(second).toBe(first);
    expect(document.version).toBe(2);
    expect(document.content).toHaveLength(7);
  });

  it('preserves valid unknown extension blocks', () => {
    const document = createDocumentCodec().parse(fixture);
    expect(document.content.at(-1)).toMatchObject({
      type: 'extension',
      name: 'uk.startupmedia.example.prayer',
      data: { label: 'Prayer', body: 'Give us wisdom.' },
    });
  });

  it('validates registered extension data', () => {
    const invalid: unknown = JSON.parse(
      fixtureSource.replace('"label": "Prayer"', '"label": 42'),
    );

    expect(() =>
      createDocumentCodec({ extensions: [prayerExtension] }).parse(invalid),
    ).toThrow(DocumentValidationError);
  });

  it('rejects malformed core content with typed issues', () => {
    const invalid = { version: 1, content: [{ id: 'bad', type: 'dashboard' }] };

    try {
      createDocumentCodec().parse(invalid);
      expect.unreachable('Expected malformed content to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentValidationError);
      if (error instanceof DocumentValidationError) {
        expect(error.issues.length).toBeGreaterThan(0);
      }
    }
  });

  it('rejects orphaned Reference definitions and missing definitions', () => {
    const orphaned = {
      version: 2,
      content: [],
      references: {
        note: {
          id: 'note',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Orphaned.' }],
            },
          ],
        },
      },
    };

    expect(() => createDocumentCodec().parse(orphaned)).toThrow(
      DocumentValidationError,
    );

    const missing = {
      version: 1,
      content: [
        {
          id: 'paragraph',
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Missing definition',
              marks: [{ type: 'reference', referenceId: 'missing' }],
            },
          ],
        },
      ],
    };
    expect(() => createDocumentCodec().parse(missing)).toThrow(
      DocumentValidationError,
    );
  });

  it('rejects duplicate structural IDs at any nesting level', () => {
    const duplicate = {
      version: 1,
      content: [
        { id: 'duplicate', type: 'paragraph', content: [] },
        {
          id: 'list',
          type: 'list',
          kind: 'bullet',
          items: [{ id: 'duplicate', content: [] }],
        },
      ],
    };

    expect(() => createDocumentCodec().parse(duplicate)).toThrow(
      DocumentValidationError,
    );
  });

  it('extracts host-neutral internal link edges with stable locations', () => {
    const document = createDocumentCodec().parse(fixture);
    expect(extractInternalDocumentLinks(document)).toEqual([
      {
        targetId: 'document-day',
        blockId: 'paragraph-1',
        path: [3],
        text: 'The Day of the Lord',
        context:
          'John does not open the seals. The Lamb does, as explored in The Day of the Lord.',
        offsetStart: 60,
        offsetEnd: 79,
      },
    ]);
  });
});

describe('document migrations', () => {
  it('is a no-op for a document already at the target version', () => {
    const result = migrateDocument(fixture, 1, []);
    expect(result).toEqual({ value: fixture, applied: [] });
  });

  it('applies an explicit legacy migration before validation', () => {
    const codec = createDocumentCodec({
      migrations: [
        {
          from: 0,
          to: 1,
          migrate(input) {
            if (
              typeof input !== 'object' ||
              input === null ||
              !('blocks' in input) ||
              !Array.isArray(input.blocks)
            ) {
              throw new Error('Invalid v0 fixture.');
            }
            return { version: 1, content: input.blocks };
          },
        },
      ],
    });

    const document = codec.parse({
      version: 0,
      blocks: [{ id: 'legacy-paragraph', type: 'paragraph', content: [] }],
    });
    expect(document).toEqual({
      version: 2,
      content: [{ id: 'legacy-paragraph', type: 'paragraph', content: [] }],
    });
  });

  it('migrates v1 and validates the new v2 portable blocks', () => {
    const migrated = createDocumentCodec().parse({ version: 1, content: [] });
    expect(migrated.version).toBe(2);

    const document = createDocumentCodec().parse({
      version: 2,
      content: [
        {
          id: 'columns',
          type: 'columns',
          columns: [
            {
              id: 'left',
              content: [{ id: 'left-text', type: 'paragraph', content: [] }],
            },
            {
              id: 'right',
              content: [{ id: 'right-text', type: 'paragraph', content: [] }],
            },
          ],
        },
        {
          id: 'toggle',
          type: 'toggle',
          summary: [{ type: 'text', text: 'Details' }],
          headingLevel: 2,
          content: [{ id: 'toggle-text', type: 'paragraph', content: [] }],
        },
        { id: 'video', type: 'video', assetId: 'video-1' },
        {
          id: 'audio',
          type: 'audio',
          src: 'https://example.com/audio.mp3',
          title: 'Audio',
        },
        {
          id: 'bookmark',
          type: 'webBookmark',
          url: 'https://example.com',
          title: 'Example',
        },
      ],
    });

    expect(
      createDocumentCodec().deserialize(
        createDocumentCodec().serialize(document),
      ),
    ).toEqual(document);
  });
});

describe('extension rendering seam', () => {
  it('supports editable and read-only rendering without core changes', () => {
    const data = prayerExtension.dataSchema.parse({
      label: 'Prayer',
      body: 'Give us wisdom.',
    });

    expect(prayerExtension.renderEditable(data, {})).toContain('data-editable');
    expect(prayerExtension.renderReadonly(data, {})).toBe(
      '<aside>Prayer: Give us wisdom.</aside>',
    );
  });
});

const _documentTypeCheck: CanonicalDocument = {
  version: 2,
  content: [],
};

void _documentTypeCheck;
