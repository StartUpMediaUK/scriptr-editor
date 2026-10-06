import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createLocalScriptureProvider,
  parseLocalScriptureDataset,
} from 'scriptr-editor/scripture';

execFileSync(process.execPath, [
  fileURLToPath(
    new URL(
      '../../scripts/build-development-scripture-data.mjs',
      import.meta.url,
    ),
  ),
]);
const input: unknown = JSON.parse(
  readFileSync(
    new URL('./public/generated/scripture-dataset.json', import.meta.url),
    'utf8',
  ),
);
const dataset = parseLocalScriptureDataset(input);
const provider = createLocalScriptureProvider(dataset);

describe('public development Scripture fixtures', () => {
  it('resolves the example passage in every synthetic comparison sample', async () => {
    expect(dataset.translations.map(({ id }) => id)).toEqual([
      'SAMPLE_A',
      'SAMPLE_B',
      'SAMPLE_C',
    ]);
    for (const translation of dataset.translations) {
      expect(translation.coverage).toBe('partial');
      const passage = await provider.getPassage(
        { book: 'ROM', chapter: 8, verseStart: 28 },
        translation.id,
      );
      expect(passage.text).toContain('ROM 8:28');
      expect(passage.text).toContain('This is not a Bible translation.');
    }
  });

  it('retains unavailable-passage behavior outside the partial fixture', async () => {
    await expect(
      provider.getPassage(
        { book: 'GEN', chapter: 2, verseStart: 1 },
        'SAMPLE_A',
      ),
    ).rejects.toMatchObject({ reason: 'not-found' });
  });
});
