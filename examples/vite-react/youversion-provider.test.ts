import { describe, expect, it, vi } from 'vitest';

import type { ScriptureProviderError } from 'scriptr-editor/host';
import { assertScriptureProviderConformance } from 'scriptr-editor/scripture';

import { createYouVersionScriptureProvider } from './youversion-provider';

const structure = {
  books: [
    {
      id: 'JHN',
      name: 'John',
      aliases: ['Jn'],
      testament: 'new' as const,
      chapters: [51, 25, 36],
    },
  ],
};
const bible = {
  youVersionId: 3034,
  id: 'BSB',
  name: 'Berean Standard Bible',
  abbreviation: 'BSB',
  languageTag: 'en',
  attribution: 'Berean Standard Bible copyright and attribution.',
};

describe('YouVersion Host adapter', () => {
  it('maps canonical ranges to plain-text YouVersion passage requests', async () => {
    const request = vi.fn().mockResolvedValue({
      status: 200,
      body: { data: { id: 'JHN.3.16-17', content: 'For God so loved…' } },
    });
    const provider = createYouVersionScriptureProvider({
      bibles: [bible],
      structure,
      request,
    });

    await expect(
      provider.getPassage(
        { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 17 },
        'BSB',
      ),
    ).resolves.toMatchObject({
      text: 'For God so loved…',
      attribution: 'Berean Standard Bible copyright and attribution.',
      cache: 'forbidden',
    });
    expect(request).toHaveBeenCalledWith(
      {
        path: '/v1/bibles/3034/passages/JHN.3.16-17',
        query: {
          format: 'text',
          include_headings: 'false',
          include_notes: 'false',
        },
      },
      undefined,
    );
  });

  it('maps license and rate-limit failures to provider errors', async () => {
    const forbidden = createYouVersionScriptureProvider({
      bibles: [bible],
      structure,
      request: () => Promise.resolve({ status: 403 }),
    });
    await expect(
      forbidden.getPassage({ book: 'JHN', chapter: 3, verseStart: 16 }, 'BSB'),
    ).rejects.toMatchObject({
      reason: 'not-licensed',
      retryable: false,
    } satisfies Partial<ScriptureProviderError>);

    const limited = createYouVersionScriptureProvider({
      bibles: [bible],
      structure,
      request: () => Promise.resolve({ status: 429 }),
    });
    await expect(
      limited.getPassage({ book: 'JHN', chapter: 3, verseStart: 16 }, 'BSB'),
    ).rejects.toMatchObject({
      reason: 'rate-limited',
      retryable: true,
    } satisfies Partial<ScriptureProviderError>);
  });

  it('passes the provider conformance contract with deterministic transport', async () => {
    const provider = createYouVersionScriptureProvider({
      bibles: [bible],
      structure,
      request: () =>
        Promise.resolve({ status: 200, body: { content: 'Passage text.' } }),
    });

    await expect(
      assertScriptureProviderConformance(provider, {
        sampleAddress: { book: 'JHN', chapter: 3, verseStart: 16 },
        sampleTranslationId: 'BSB',
      }),
    ).resolves.toBeUndefined();
  });
});
