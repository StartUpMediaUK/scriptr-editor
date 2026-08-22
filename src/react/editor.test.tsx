/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CanonicalDocument } from '../document/types.js';
import { ScriptrEditor } from './editor.js';

const document: CanonicalDocument = {
  version: 1,
  content: [
    {
      id: 'paragraph',
      type: 'paragraph',
      content: [{ type: 'text', text: 'A quiet writing surface.' }],
    },
  ],
};

afterEach(cleanup);

describe('ScriptrEditor', () => {
  it('renders canonical content and accessible editing controls', async () => {
    render(<ScriptrEditor value={document} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Document editor')).toHaveTextContent(
        'A quiet writing surface.',
      );
    });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Drag block to reorder')).toBeInTheDocument();
  });

  it('removes editing chrome when configured read-only', async () => {
    render(<ScriptrEditor editable={false} value={document} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Document editor')).toHaveTextContent(
        'A quiet writing surface.',
      );
    });
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('creates an empty uncontrolled document when no value is supplied', async () => {
    render(<ScriptrEditor />);

    await waitFor(() => {
      expect(screen.getByLabelText('Document editor')).toHaveTextContent('');
    });
  });
});
