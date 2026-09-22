import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type { ScriptureProviderError } from '../host/scripture.js';
import {
  createLocalScriptureProvider,
  parseLocalScriptureDataset,
} from './local-dataset.js';

const partialDataset = {
  version: 1,
  translations: [
    {
      id: 'TEST',
      name: 'Test Translation',
      abbreviation: 'TST',
      languageTag: 'en',
      attribution: 'Test translation — development only.',
      coverage: 'partial',
      books: {
        REV: {
          '22': { '20': 'Surely I come quickly.', '21': 'Grace be with all.' },
        },
        GEN: {
          '1': {
            '1': 'In the beginning.',
            '2': 'The earth was without form.',
          },
        },
      },
    },
  ],
} as const;

describe('local Scripture dataset', () => {
  it('validates normalized data and exposes canonical book order', async () => {
    const dataset = parseLocalScriptureDataset(partialDataset);
    const provider = createLocalScriptureProvider(dataset);

    await expect(provider.getStructure()).resolves.toMatchObject({
      books: [{ id: 'GEN' }, { id: 'REV' }],
    });
    await expect(provider.listTranslations()).resolves.toEqual([
      {
        id: 'TEST',
        name: 'Test Translation',
        abbreviation: 'TST',
        languageTag: 'en',
        attribution: 'Test translation — development only.',
      },
    ]);
  });

  it('joins inclusive verse ranges and returns persistent attribution', async () => {
    const provider = createLocalScriptureProvider(
      parseLocalScriptureDataset(partialDataset),
    );

    await expect(
      provider.getPassage(
        { book: 'GEN', chapter: 1, verseStart: 1, verseEnd: 2 },
        'TEST',
      ),
    ).resolves.toEqual({
      address: { book: 'GEN', chapter: 1, verseStart: 1, verseEnd: 2 },
      translationId: 'TEST',
      text: 'In the beginning. The earth was without form.',
      attribution: 'Test translation — development only.',
      cache: 'persistent',
    });
  });

  it('reports missing passages through the provider error contract', async () => {
    const provider = createLocalScriptureProvider(
      parseLocalScriptureDataset(partialDataset),
    );

    await expect(
      provider.getPassage({ book: 'REV', chapter: 22, verseStart: 19 }, 'TEST'),
    ).rejects.toMatchObject({
      reason: 'not-found',
      retryable: false,
    } satisfies Partial<ScriptureProviderError>);
  });

  it('rejects duplicate translations and invalid canonical content with field paths', () => {
    expect(() =>
      parseLocalScriptureDataset({
        ...partialDataset,
        translations: [
          partialDataset.translations[0],
          partialDataset.translations[0],
        ],
      }),
    ).toThrow(ZodError);

    expect(() =>
      parseLocalScriptureDataset({
        version: 1,
        translations: [
          {
            ...partialDataset.translations[0],
            books: { GEN: { '51': { '1': 'Impossible chapter.' } } },
          },
        ],
      }),
    ).toThrow(/Genesis has only 50 chapters/);
  });

  it('honours abort signals', async () => {
    const provider = createLocalScriptureProvider(
      parseLocalScriptureDataset(partialDataset),
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.getStructure(controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
