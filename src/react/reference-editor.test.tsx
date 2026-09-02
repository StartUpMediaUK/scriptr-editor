/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReferenceEditor } from './reference-editor.js';

afterEach(cleanup);

describe('ReferenceEditor', () => {
  it('exposes only shallow annotation formatting', async () => {
    render(
      <ReferenceEditor
        onChange={vi.fn()}
        reference={{
          id: 'reference',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Christ is the last Adam.' }],
            },
          ],
        }}
      />,
    );
    expect(
      await screen.findByLabelText('Reference annotation'),
    ).toHaveTextContent('Christ is the last Adam.');
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /image/i })).toBeNull();
  });
});
