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

import { createFakeScriptureProvider } from '../scripture/fake-provider.js';
import { testStructure } from '../scripture/test-structure.js';
import { ScriptureCommandDialog } from './scripture-command-dialog.js';

afterEach(cleanup);

const translations = [
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
];

describe('ScriptureCommandDialog', () => {
  it('loads provider data and returns a canonical Scripture choice', async () => {
    const onSelect = vi.fn();
    render(
      <ScriptureCommandDialog
        mode="scripture"
        onCancel={() => undefined}
        onSelect={onSelect}
        provider={createFakeScriptureProvider({
          translations,
          structure: testStructure,
        })}
      />,
    );

    const input = await screen.findByPlaceholderText('Romans 8:28-30');
    expect(screen.getAllByRole('button', { name: /close/i })).toHaveLength(1);
    fireEvent.change(input, { target: { value: 'Romans 8:28' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert reference' }));

    expect(onSelect).toHaveBeenCalledWith(
      { book: 'ROM', chapter: 8, verseStart: 28 },
      ['KJV'],
    );
  });

  it('requires two translations for comparison and exposes cancellation', async () => {
    render(
      <ScriptureCommandDialog
        mode="comparison"
        onCancel={() => undefined}
        onSelect={() => undefined}
        provider={createFakeScriptureProvider({
          translations: translations.slice(0, 1),
          structure: testStructure,
        })}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'At least two translations are required.',
      ),
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
