import { describe, expect, it } from 'vitest';

import { createDocumentCodec } from '../document/codec.js';
import {
  canonicalToEditorJson,
  editorJsonToCanonical,
} from '../react/adapter.js';

describe('accent formatting', () => {
  it('is validated, serializable, and survives the editor adapter', () => {
    const document = createDocumentCodec().parse({
      version: 2,
      content: [
        {
          id: 'accent',
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Grace', marks: [{ type: 'accent' }] },
          ],
        },
      ],
    });
    expect(editorJsonToCanonical(canonicalToEditorJson(document))).toEqual(
      document,
    );
  });
});
