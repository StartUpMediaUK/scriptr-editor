import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createLocalScriptureProvider,
  parseLocalScriptureDataset,
} from '@startupmedia/scriptr-editor/scripture';

const contentRoot = resolve(import.meta.dirname);

describe('consumer documentation', () => {
  it('links every guide from its navigation and overview', () => {
    const meta: unknown = JSON.parse(
      readFileSync(resolve(contentRoot, 'meta.json'), 'utf8'),
    );
    const expectedPages = [
      'index',
      'react',
      'styling',
      'scripture',
      'hosts',
      'documents',
      'extensions',
      'transport',
      'release',
    ];
    expect(meta).toEqual({
      title: 'Scriptr Editor',
      pages: [...expectedPages, 'reference'],
    });
    const overview = readFileSync(resolve(contentRoot, 'index.mdx'), 'utf8');
    for (const name of expectedPages) {
      expect(existsSync(resolve(contentRoot, `${name}.mdx`))).toBe(true);
      if (name !== 'index') expect(overview).toContain(`/docs/${name}`);
    }
  });

  it('resolves the actual normalized JSON example in the Scripture guide', async () => {
    const source = readFileSync(resolve(contentRoot, 'scripture.mdx'), 'utf8');
    const json = /```json\s+([\s\S]*?)```/.exec(source)?.[1];
    if (!json) throw new Error('The normalized dataset example is missing.');
    const input: unknown = JSON.parse(json);
    const provider = createLocalScriptureProvider(
      parseLocalScriptureDataset(input),
    );
    const passage = await provider.getPassage(
      { book: 'GEN', chapter: 1, verseStart: 1 },
      'private-kjv',
    );
    expect(passage.verses).toEqual([
      {
        number: 1,
        text: 'In the beginning God created the heaven and the earth.',
      },
    ]);
    expect(
      (await provider.getStructure()).books.map((book) => book.id),
    ).toEqual(['GEN']);
  });
});
