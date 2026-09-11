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
      expect(screen.getByRole('textbox', { name: 'Bible book' })).toHaveValue(
        'Romans',
      ),
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

  it('keeps passage data committed while a segmented address draft is edited', async () => {
    const onChange = vi.fn();
    render(
      <ScriptureBlockContent
        block={block}
        editable
        onChange={onChange}
        provider={provider}
      />,
    );
    const book = await screen.findByRole('textbox', { name: 'Bible book' });
    const chapter = screen.getByRole('textbox', { name: 'Chapter' });
    const verses = screen.getByRole('textbox', { name: 'Verse or range' });
    if (!(chapter instanceof HTMLInputElement))
      throw new Error('Chapter control must be an input.');
    if (!(verses instanceof HTMLInputElement))
      throw new Error('Verse control must be an input.');

    fireEvent.change(book, { target: { value: 'J' } });
    expect(book.closest('label')).toHaveTextContent('John');
    fireEvent.change(book, { target: { value: 'John' } });
    fireEvent.change(chapter, { target: { value: '3' } });
    fireEvent.change(verses, { target: { value: '16' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(verses, { relatedTarget: null });
    expect(onChange).toHaveBeenCalledWith({
      ...block,
      address: { book: 'JHN', chapter: 3, verseStart: 16 },
    });
  });

  it('moves between exact and adjacent address segments from their boundaries', async () => {
    render(
      <ScriptureBlockContent block={block} editable provider={provider} />,
    );
    const book = await screen.findByRole('textbox', { name: 'Bible book' });
    const chapter = screen.getByRole('textbox', { name: 'Chapter' });
    const verses = screen.getByRole('textbox', { name: 'Verse or range' });

    if (!(chapter instanceof HTMLInputElement))
      throw new Error('Chapter control must be an input.');
    if (!(verses instanceof HTMLInputElement))
      throw new Error('Verse control must be an input.');

    fireEvent.keyDown(book, { key: 'Enter' });
    expect(chapter).toHaveFocus();

    verses.focus();
    verses.setSelectionRange(0, 0);
    fireEvent.keyDown(verses, { key: 'ArrowLeft' });
    expect(chapter).toHaveFocus();

    chapter.setSelectionRange(0, 0);
    fireEvent.keyDown(chapter, { key: 'Backspace' });
    expect(book).toHaveFocus();
  });
});
