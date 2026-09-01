/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { testStructure } from '../scripture/test-structure.js';
import { ScripturePicker } from './scripture-picker.js';

afterEach(cleanup);

describe('ScripturePicker', () => {
  it('deliberately returns a typed verse range', () => {
    const onSelect = vi.fn();
    render(
      <ScripturePicker
        initialQuery="Romans 8:28-30"
        onSelect={onSelect}
        structure={testStructure}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Insert reference' }));
    expect(onSelect).toHaveBeenCalledWith({
      book: 'ROM',
      chapter: 8,
      verseStart: 28,
      verseEnd: 30,
    });
  });

  it('exposes offline reference construction without claiming passage text', () => {
    render(
      <ScripturePicker offline onSelect={vi.fn()} structure={testStructure} />,
    );
    expect(
      screen.getByText('Reference selection available offline'),
    ).toBeInTheDocument();
  });
});
