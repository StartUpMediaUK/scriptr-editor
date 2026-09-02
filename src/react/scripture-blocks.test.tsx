/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TranslationComparisonBlock } from '../document/types.js';
import { createFakeScriptureProvider } from '../scripture/fake-provider.js';
import { testStructure } from '../scripture/test-structure.js';
import { ScriptureBlockContent } from './scripture-blocks.js';

afterEach(cleanup);

const block: TranslationComparisonBlock = {
  id: 'comparison',
  type: 'translationComparison',
  address: { book: 'ROM', chapter: 8, verseStart: 28 },
  translationIds: ['KJV', 'WEB'],
  layout: 'twoColumn',
};

const provider = createFakeScriptureProvider({
  structure: testStructure,
  translations: [
    {
      id: 'KJV',
      name: 'King James Version',
      abbreviation: 'KJV',
      languageTag: 'en',
    },
    {
      id: 'WEB',
      name: 'World English Bible',
      abbreviation: 'WEB',
      languageTag: 'en',
    },
  ],
});

describe('ScriptureBlockContent', () => {
  it('keeps translation order and layout changes in authored configuration', async () => {
    const onChange = vi.fn();
    render(
      <ScriptureBlockContent
        block={block}
        editable
        onChange={onChange}
        provider={provider}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('Romans 8:28')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'One column' }));
    expect(onChange).toHaveBeenCalledWith({ ...block, layout: 'oneColumn' });

    fireEvent.click(screen.getByRole('button', { name: 'Move WEB earlier' }));
    expect(onChange).toHaveBeenCalledWith({
      ...block,
      translationIds: ['WEB', 'KJV'],
    });
  });

  it('retains the address when passage text is unavailable', () => {
    render(<ScriptureBlockContent block={block} />);
    expect(screen.getByText('ROM 8:28')).toBeInTheDocument();
    expect(
      screen.getAllByText('Passage text is not available locally.'),
    ).toHaveLength(2);
  });
});
