import { describe, expect, it } from 'vitest';

import type {
  PassageText,
  ScriptureProvider,
  ScriptureStructure,
  ScriptureTranslation,
} from './scripture.js';

class FakeScriptureProvider implements ScriptureProvider {
  listTranslations(): Promise<readonly ScriptureTranslation[]> {
    return Promise.resolve([
      {
        id: 'WEB',
        name: 'World English Bible',
        abbreviation: 'WEB',
        languageTag: 'en',
      },
    ]);
  }

  getStructure(): Promise<ScriptureStructure> {
    return Promise.resolve({
      books: [
        {
          id: 'ROM',
          name: 'Romans',
          aliases: ['Ro', 'Rom'],
          chapters: [16, 33, 33, 35, 23, 29, 25, 39],
        },
      ],
    });
  }

  canonicalizeAddress(address: {
    readonly book: string;
    readonly chapter: number;
    readonly verseStart?: number | undefined;
    readonly verseEnd?: number | undefined;
  }) {
    return Promise.resolve(address);
  }

  getPassage(
    address: {
      readonly book: string;
      readonly chapter: number;
      readonly verseStart?: number | undefined;
      readonly verseEnd?: number | undefined;
    },
    translationId: string,
  ): Promise<PassageText> {
    return Promise.resolve({
      address,
      translationId,
      text: 'There is therefore now no condemnation...',
      attribution: 'World English Bible',
      cache: 'persistent',
    });
  }
}

describe('ScriptureProvider contract', () => {
  it('can be implemented without YouVersion or application types', async () => {
    const provider: ScriptureProvider = new FakeScriptureProvider();
    const translations = await provider.listTranslations();
    const passage = await provider.getPassage(
      { book: 'ROM', chapter: 8, verseStart: 1 },
      'WEB',
    );

    expect(translations[0]?.id).toBe('WEB');
    expect(passage.attribution).toBe('World English Bible');
    expect(passage.cache).toBe('persistent');
  });
});
