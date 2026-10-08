import { describe, expect, it } from 'vitest';
import { parseDocumentProvenance } from './provenance.js';
import type { CanonicalDocument } from './types.js';

const document: CanonicalDocument = {
  version: 2,
  content: [
    {
      id: 'p',
      type: 'paragraph',
      content: [{ type: 'text', text: 'Old ABC' }],
    },
  ],
};
const contribution = {
  id: 'writing',
  anchors: [{ blockId: 'p', field: 'content', offset: 4, length: 3 }],
};
const sidecar = { version: 1, contributions: [contribution] };

describe('persisted document provenance', () => {
  it('round-trips a validated versioned sidecar separately from the document', () => {
    expect(
      parseDocumentProvenance(JSON.parse(JSON.stringify(sidecar)), document),
    ).toEqual(sidecar);
    expect(document).not.toHaveProperty('contributions');
  });
  it('rejects unsupported versions and malformed data', () => {
    expect(() =>
      parseDocumentProvenance({ ...sidecar, version: 2 }, document),
    ).toThrow();
    expect(() =>
      parseDocumentProvenance(
        { ...sidecar, applicationTimestamp: 123 },
        document,
      ),
    ).toThrow();
    expect(() =>
      parseDocumentProvenance(
        { version: 1, contributions: [{ id: 'bad', anchors: [] }] },
        document,
      ),
    ).toThrow();
  });
  it('rejects stale anchors instead of dropping contribution records', () => {
    expect(() =>
      parseDocumentProvenance(
        {
          version: 1,
          contributions: [
            {
              ...contribution,
              anchors: [{ ...contribution.anchors[0], offset: 99 }],
            },
          ],
        },
        document,
      ),
    ).toThrow('Anchor does not resolve');
  });
  it('rejects duplicate identities and overlapping ownership', () => {
    expect(() =>
      parseDocumentProvenance(
        { version: 1, contributions: [contribution, contribution] },
        document,
      ),
    ).toThrow();
    expect(() =>
      parseDocumentProvenance(
        {
          version: 1,
          contributions: [contribution, { ...contribution, id: 'other' }],
        },
        document,
      ),
    ).toThrow('overlap');
  });
});
