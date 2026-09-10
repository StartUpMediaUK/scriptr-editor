import { describe, expect, it } from 'vitest';

import { defineScriptr } from './config.js';

describe('defineScriptr', () => {
  it('assembles immutable capability-driven defaults and overrides', () => {
    const config = defineScriptr({ features: { audio: false } });
    expect(config.features).toMatchObject({
      scripture: false,
      references: true,
      columns: true,
      video: false,
      audio: false,
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.features)).toBe(true);
    expect(config.documents.parse({ version: 1, content: [] }).version).toBe(2);
  });

  it('enables provider-backed workflows when capabilities are configured', () => {
    const config = defineScriptr({
      capabilities: {
        scripture: {
          listTranslations: () => Promise.resolve([]),
          getStructure: () => Promise.resolve({ books: [] }),
          canonicalizeAddress: (address) => Promise.resolve(address),
          getPassage: (address, translationId) =>
            Promise.resolve({
              address,
              translationId,
              text: '',
              attribution: '',
              cache: 'forbidden',
            }),
        },
      },
    });

    expect(config.features.scripture).toBe(true);
    expect(config.features.comparison).toBe(true);
    expect(config.features.bookmarks).toBe(false);
  });
});
