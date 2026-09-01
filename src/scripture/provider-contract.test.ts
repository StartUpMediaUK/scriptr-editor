import { describe, expect, it } from 'vitest';

import type { ScriptureProviderError } from '../host/scripture.js';
import { testStructure } from './test-structure.js';
import { createFakeScriptureProvider } from './fake-provider.js';
import { assertScriptureProviderConformance } from './provider-contract.js';

const address = { book: 'ROM', chapter: 8, verseStart: 28 } as const;
const translations = [
  {
    id: 'TEST',
    name: 'Test Translation',
    abbreviation: 'TEST',
    languageTag: 'en',
  },
];

describe('Scripture provider contract', () => {
  it('accepts a deterministic provider with attribution and cache policy', async () => {
    const provider = createFakeScriptureProvider({
      translations,
      structure: testStructure,
      passages: [
        {
          address,
          translationId: 'TEST',
          text: 'All things work together for good.',
          attribution: 'Test text — example only.',
          cache: 'persistent',
        },
      ],
    });

    await expect(
      assertScriptureProviderConformance(provider, {
        sampleAddress: address,
        sampleTranslationId: 'TEST',
      }),
    ).resolves.toBeUndefined();
  });

  it('distinguishes offline passage text from offline reference structure', async () => {
    const provider = createFakeScriptureProvider({
      translations,
      structure: testStructure,
      offline: true,
    });

    await expect(provider.getStructure()).resolves.toEqual(testStructure);
    await expect(provider.getPassage(address, 'TEST')).rejects.toMatchObject({
      reason: 'offline',
      retryable: true,
    } satisfies Partial<ScriptureProviderError>);
  });

  it('honours abort signals', async () => {
    const provider = createFakeScriptureProvider({
      translations,
      structure: testStructure,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.listTranslations(controller.signal),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
