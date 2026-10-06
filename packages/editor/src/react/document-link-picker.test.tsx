/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocumentTargetProvider } from '../host/documents.js';
import { DocumentLinkPicker } from './document-link-picker.js';

afterEach(cleanup);

const provider: DocumentTargetProvider = {
  search: (query) =>
    Promise.resolve(
      query.toLowerCase().startsWith('day')
        ? [{ id: 'day', label: 'The Day of the Lord', description: 'Study' }]
        : [],
    ),
  resolve: () => Promise.resolve(undefined),
};

describe('DocumentLinkPicker', () => {
  it('searches host documents and returns an opaque target', async () => {
    const onSelect = vi.fn();
    render(<DocumentLinkPicker onSelect={onSelect} provider={provider} />);
    expect(
      screen.getByRole('button', { name: 'Show options' }),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Search documents' }),
      {
        target: { value: 'day' },
      },
    );
    const target = await screen.findByRole('option', {
      name: /The Day of the Lord/,
    });
    fireEvent.click(target);
    expect(onSelect).toHaveBeenCalledWith({
      id: 'day',
      label: 'The Day of the Lord',
      description: 'Study',
    });
  });
});
