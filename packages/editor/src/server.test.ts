import { describe, expect, it } from 'vitest';

import { createScriptrServer } from './server.js';

describe('createScriptrServer', () => {
  it('exposes only configured server-side provider handlers', async () => {
    expect(createScriptrServer({}).scripture).toBeUndefined();

    const server = createScriptrServer({
      scripture: {
        listTranslations: () => Promise.resolve([]),
        getStructure: () => Promise.resolve({ books: [] }),
        canonicalizeAddress: (address) => Promise.resolve(address),
        getPassage: (address, translationId) =>
          Promise.resolve({
            address,
            translationId,
            text: 'Text',
            attribution: 'Fixture',
            cache: 'forbidden',
          }),
      },
    });

    await expect(
      server.scripture?.({ operation: 'listTranslations' }),
    ).resolves.toEqual({
      ok: true,
      result: { operation: 'listTranslations', value: [] },
    });
    expect(Object.isFrozen(server)).toBe(true);
  });
});
