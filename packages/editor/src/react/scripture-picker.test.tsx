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

  it('groups matching books and omits empty testament groups', () => {
    render(
      <ScripturePicker
        initialQuery="John"
        onSelect={vi.fn()}
        structure={testStructure}
      />,
    );
    expect(screen.getByText('New Testament')).toBeInTheDocument();
    expect(screen.queryByText('Old Testament')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1 John' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '3 John' })).toBeInTheDocument();
  });

  it('disables impossible ranges with a specific unavailable verse', () => {
    render(
      <ScripturePicker
        initialQuery="John 1:50-52"
        onSelect={vi.fn()}
        structure={testStructure}
      />,
    );
    expect(screen.getByText(/no available John 1:52/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Insert reference' }),
    ).toBeDisabled();
    expect(screen.getByRole('option', { name: '50' })).toHaveAttribute(
      'data-selected',
    );
    expect(screen.getByRole('option', { name: '51' })).toHaveAttribute(
      'data-selected',
    );
  });
});
