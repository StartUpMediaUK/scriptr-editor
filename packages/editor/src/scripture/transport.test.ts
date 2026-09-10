import { describe, expect, it } from 'vitest';

import type { ScriptureProviderError } from '../host/scripture.js';
import {
  createRemoteScriptureProvider,
  createScriptureTransportHandler,
} from './transport.js';

describe('Scripture transport', () => {
  it('carries provider behavior without exposing provider configuration', async () => {
    const remote = createRemoteScriptureProvider(
      createScriptureTransportHandler({
        listTranslations: () =>
          Promise.resolve([
            {
              id: 'WEB',
              name: 'World English Bible',
              abbreviation: 'WEB',
              languageTag: 'en',
            },
          ]),
        getStructure: () => Promise.resolve({ books: [] }),
        canonicalizeAddress: (address) => Promise.resolve(address),
        getPassage: (address, translationId) =>
          Promise.resolve({
            address,
            translationId,
            text: 'Text',
            attribution: 'Fixture',
            cache: 'session',
          }),
      }),
    );

    await expect(remote.listTranslations()).resolves.toHaveLength(1);
    await expect(
      remote.getPassage({ book: 'JHN', chapter: 3, verseStart: 16 }, 'WEB'),
    ).resolves.toMatchObject({ text: 'Text' });
  });

  it('preserves typed provider failures', async () => {
    const remote = createRemoteScriptureProvider(() =>
      Promise.resolve({
        ok: false,
        reason: 'rate-limited',
        message: 'Later',
        retryable: true,
      }),
    );
    await expect(remote.getStructure()).rejects.toEqual(
      expect.objectContaining<Partial<ScriptureProviderError>>({
        reason: 'rate-limited',
        retryable: true,
      }),
    );
  });
});
