import { describe, expect, it } from 'vitest';
import { createDocumentCodec } from 'scriptr-editor/document';
import {
  createTimedNoteRenderer,
  timedNoteRegistration,
} from './extension-recipe';

describe('timed-note consumer recipe', () => {
  it('migrates legacy payloads while keeping the canonical version independent', () => {
    const codec = createDocumentCodec({ extensions: [timedNoteRegistration] });
    const document = codec.parse({
      version: 2,
      content: [
        {
          id: 'note',
          type: 'extension',
          name: timedNoteRegistration.name,
          version: 1,
          data: { seconds: 42, label: ' A point ' },
        },
      ],
    });
    expect(document.content[0]).toMatchObject({
      version: 2,
      data: { positionSeconds: 42, label: 'A point' },
    });
    expect(codec.deserialize(codec.serialize(document))).toEqual(document);
  });

  it('rejects invalid payloads and future registered versions without deleting data', () => {
    expect(() =>
      timedNoteRegistration.parseData({
        positionSeconds: -1,
        label: 'Invalid',
      }),
    ).toThrow();
    const codec = createDocumentCodec({ extensions: [timedNoteRegistration] });
    expect(() =>
      codec.parse({
        version: 2,
        content: [
          {
            id: 'note',
            type: 'extension',
            name: timedNoteRegistration.name,
            version: 3,
            data: { positionSeconds: 1, label: 'Future' },
          },
        ],
      }),
    ).toThrow();
  });

  it('contributes a portable slash-command block and matching rendering definitions', () => {
    const renderer = createTimedNoteRenderer();
    const block = renderer.slashItems?.[0]?.createBlock();
    expect(block).toMatchObject({
      type: 'extension',
      name: timedNoteRegistration.name,
      version: 2,
    });
    expect(
      renderer.renderReadonly({ positionSeconds: 12, label: 'Point' }, {}),
    ).toBeDefined();
    expect(
      renderer.renderEditable?.({ positionSeconds: 12, label: 'Point' }, {}),
    ).toBeDefined();
  });
});
