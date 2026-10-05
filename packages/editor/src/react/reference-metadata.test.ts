import { describe, expect, it } from 'vitest';
import { Fragment, Schema, Slice } from '@tiptap/pm/model';
import {
  parseReferenceMetadata,
  remapPastedReferences,
} from './reference-metadata.js';

const schema = new Schema({
  nodes: { doc: { content: 'text*' }, text: {} },
  marks: {
    referenceAnchor: { attrs: { referenceId: {}, referenceData: {} } },
    bold: {},
  },
});

describe('private Reference clipboard metadata', () => {
  it('rejects malformed, unrecognized and mismatched metadata without losing text', () => {
    expect(parseReferenceMetadata('{broken')).toBeUndefined();
    expect(
      parseReferenceMetadata(
        JSON.stringify({ id: 'source', content: [], unexpected: true }),
      ),
    ).toBeUndefined();
    const text = schema.text('Keep this', [
      schema.mark('bold'),
      schema.mark('referenceAnchor', {
        referenceId: 'source',
        referenceData: '{broken',
      }),
    ]);
    const result = remapPastedReferences(new Slice(Fragment.from(text), 0, 0));
    expect(result.content.textBetween(0, result.content.size)).toBe(
      'Keep this',
    );
    expect(
      result.content.firstChild?.marks.map(({ type }) => type.name),
    ).toEqual(['bold']);
  });

  it('keeps one identity across split spans and a distinct identity for each paste', () => {
    const reference = {
      id: 'source',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Note' }] },
      ],
    };
    const mark = schema.mark('referenceAnchor', {
      referenceId: reference.id,
      referenceData: JSON.stringify(reference),
    });
    const slice = new Slice(
      Fragment.from([
        schema.text('First', [mark]),
        schema.text(' second', [mark, schema.mark('bold')]),
      ]),
      0,
      0,
    );
    const first = remapPastedReferences(slice);
    const second = remapPastedReferences(slice);
    const id: unknown = first.content.firstChild?.marks[0]?.attrs.referenceId;
    expect(id).not.toBe(reference.id);
    expect(
      first.content.lastChild?.marks.find(
        ({ type }) => type.name === 'referenceAnchor',
      )?.attrs.referenceId,
    ).toBe(id);
    expect(second.content.firstChild?.marks[0]?.attrs.referenceId).not.toBe(id);
  });
});
