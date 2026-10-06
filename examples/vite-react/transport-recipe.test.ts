import { describe, expect, it } from 'vitest';
import {
  createLocalScriptureProvider,
  parseLocalScriptureDataset,
} from 'scriptr-editor/scripture';
import { createTransportRecipe } from './transport-recipe';

const local = createLocalScriptureProvider(
  parseLocalScriptureDataset({
    version: 1,
    translations: [
      {
        id: 'private',
        name: 'Private sample',
        abbreviation: 'P',
        languageTag: 'en',
        attribution: 'Host fixture',
        coverage: 'partial',
        books: { GEN: { '1': { '1': 'An authored fixture verse.' } } },
      },
    ],
  }),
);

describe('host transport recipe', () => {
  it('preserves text, verse boundaries, attribution and typed missing-passage failures', async () => {
    const remote = createTransportRecipe(local);
    expect(await remote.listTranslations()).toHaveLength(1);
    expect((await remote.getStructure()).books[0]?.id).toBe('GEN');
    const address = { book: 'GEN', chapter: 1, verseStart: 1 };
    expect(await remote.canonicalizeAddress(address)).toEqual(address);
    expect(await remote.getPassage(address, 'private')).toMatchObject({
      attribution: 'Host fixture',
      verses: [{ number: 1, text: 'An authored fixture verse.' }],
    });
    await expect(remote.getPassage(address, 'missing')).rejects.toMatchObject({
      reason: 'not-found',
      retryable: false,
    });
  });

  it('does not dispatch an already-aborted request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createTransportRecipe(local).getStructure(controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
