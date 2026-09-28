/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TranslationComparisonBlock } from '../document/types.js';
import { ScriptureProviderError } from '../host/scripture.js';
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
    {
      id: 'BSB',
      name: 'Berean Standard Bible',
      abbreviation: 'BSB',
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

    await screen.findByRole('button', {
      name: 'Edit Scripture address Romans 8:28',
    });
    fireEvent.click(screen.getByRole('button', { name: 'One column' }));
    expect(
      screen
        .getByRole('button', { name: 'One column' })
        .closest('.scriptr-editor__context-toolbar'),
    ).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith({ ...block, layout: 'oneColumn' });

    fireEvent.click(screen.getByRole('button', { name: 'Move WEB earlier' }));
    expect(onChange).toHaveBeenCalledWith({
      ...block,
      translationIds: ['WEB', 'KJV'],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add translation' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Berean Standard Bible' }),
    );
    expect(onChange).toHaveBeenCalledWith({
      ...block,
      translationIds: ['KJV', 'WEB', 'BSB'],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove WEB' }));
    expect(onChange).toHaveBeenCalledWith({
      ...block,
      translationIds: ['KJV'],
    });
  });

  it('retains the address when passage text is unavailable', () => {
    render(<ScriptureBlockContent block={block} />);
    expect(screen.getByText('ROM 8:28')).toBeInTheDocument();
    expect(
      screen.getAllByText('Passage text is not available locally.'),
    ).toHaveLength(2);
  });

  it('distinguishes retryable offline passages and retries in place', async () => {
    const getPassage = vi
      .fn()
      .mockRejectedValueOnce(
        new ScriptureProviderError(
          'offline',
          'Passage unavailable offline.',
          true,
        ),
      )
      .mockResolvedValue({
        address: block.address,
        translationId: 'KJV',
        text: 'All things work together for good.',
        attribution: 'Test translation',
        cache: 'persistent' as const,
      });
    render(
      <ScriptureBlockContent
        block={{ ...block, translationIds: ['KJV'] }}
        provider={{ ...provider, getPassage }}
      />,
    );

    expect(
      await screen.findByText('Passage unavailable offline.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Passage unavailable offline.').closest('[data-state]'),
    ).toHaveAttribute('data-state', 'offline');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('All things work together for good.'),
    ).toBeInTheDocument();
    expect(getPassage).toHaveBeenCalledTimes(2);
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
    const addressButton = await screen.findByRole('button', {
      name: 'Edit Scripture address Romans 8:28',
    });
    expect(
      screen.queryByRole('textbox', { name: 'Bible book' }),
    ).not.toBeInTheDocument();
    fireEvent.doubleClick(addressButton);
    const book = screen.getByRole('textbox', { name: 'Bible book' });
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
    const addressButton = await screen.findByRole('button', {
      name: 'Edit Scripture address Romans 8:28',
    });
    fireEvent.doubleClick(addressButton);
    const book = screen.getByRole('textbox', { name: 'Bible book' });
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

  it('returns segmented address editing to the button on blur or Escape', async () => {
    render(
      <ScriptureBlockContent block={block} editable provider={provider} />,
    );
    const addressButton = await screen.findByRole('button', {
      name: 'Edit Scripture address Romans 8:28',
    });

    fireEvent.doubleClick(addressButton);
    const book = screen.getByRole('textbox', { name: 'Bible book' });
    fireEvent.keyDown(book, { key: 'Escape' });
    expect(
      screen.getByRole('button', {
        name: 'Edit Scripture address Romans 8:28',
      }),
    ).toBeInTheDocument();

    fireEvent.doubleClick(
      screen.getByRole('button', {
        name: 'Edit Scripture address Romans 8:28',
      }),
    );
    fireEvent.blur(screen.getByRole('textbox', { name: 'Bible book' }), {
      relatedTarget: null,
    });
    expect(
      screen.getByRole('button', {
        name: 'Edit Scripture address Romans 8:28',
      }),
    ).toBeInTheDocument();
  });

  it('pastes a complete reference across the segmented address editor', async () => {
    const onChange = vi.fn();
    render(
      <ScriptureBlockContent
        block={block}
        editable
        onChange={onChange}
        provider={provider}
      />,
    );
    const addressButton = await screen.findByRole('button', {
      name: 'Edit Scripture address Romans 8:28',
    });
    fireEvent.doubleClick(addressButton);
    const address = screen.getByRole('group', {
      name: 'Scripture address',
    });

    fireEvent.paste(address, {
      clipboardData: { getData: () => 'John 3:16-17' },
    });

    expect(screen.getByRole('textbox', { name: 'Bible book' })).toHaveValue(
      'John',
    );
    expect(screen.getByRole('textbox', { name: 'Chapter' })).toHaveValue('3');
    expect(screen.getByRole('textbox', { name: 'Verse or range' })).toHaveValue(
      '16-17',
    );
    expect(
      screen.getByRole('textbox', { name: 'Verse or range' }),
    ).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith({
      ...block,
      address: { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 17 },
    });
  });

  it('opens the full reference picker from a single click and updates the block', async () => {
    const onChange = vi.fn();
    render(
      <ScriptureBlockContent
        block={block}
        editable
        onChange={onChange}
        provider={provider}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Edit Scripture address Romans 8:28',
      }),
    );
    const input = await screen.findByPlaceholderText('Romans 8:28-30');
    fireEvent.change(input, { target: { value: 'John 3:16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update reference' }));
    expect(onChange).toHaveBeenCalledWith({
      ...block,
      address: { book: 'JHN', chapter: 3, verseStart: 16 },
    });
  });

  it('renders provider verse boundaries with visible verse markers', async () => {
    render(
      <ScriptureBlockContent
        block={{ ...block, translationIds: ['KJV'] }}
        provider={createFakeScriptureProvider({
          structure: testStructure,
          translations: [
            {
              id: 'KJV',
              name: 'King James Version',
              abbreviation: 'KJV',
              languageTag: 'en',
            },
          ],
          passages: [
            {
              address: block.address,
              translationId: 'KJV',
              text: 'First verse. Second verse.',
              verses: [
                { number: 28, text: 'First verse.' },
                { number: 29, text: 'Second verse.' },
              ],
              attribution: 'Test translation',
              cache: 'persistent',
            },
          ],
        })}
      />,
    );

    expect(await screen.findByText('28')).toHaveClass(
      'scriptr-scripture__verse-number',
    );
    expect(screen.getByText('29')).toHaveClass(
      'scriptr-scripture__verse-number',
    );
  });
});
