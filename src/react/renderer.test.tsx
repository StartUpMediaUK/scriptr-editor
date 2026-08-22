/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalDocument } from '../document/types.js';
import { ScriptrRenderer } from './renderer.js';

const document: CanonicalDocument = {
  version: 1,
  content: [
    {
      id: 'heading',
      type: 'heading',
      level: 2,
      content: [{ type: 'text', text: 'The Seven Seals' }],
    },
    {
      id: 'paragraph',
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'The Day of the Lord',
          marks: [
            { type: 'bold' },
            { type: 'internalDocumentLink', targetId: 'day-of-the-lord' },
          ],
        },
      ],
    },
    {
      id: 'list',
      type: 'list',
      kind: 'check',
      items: [
        {
          id: 'item',
          checked: true,
          content: [{ type: 'text', text: 'Read Revelation 6' }],
        },
      ],
    },
  ],
};

afterEach(cleanup);

describe('ScriptrRenderer', () => {
  it('preserves authored hierarchy without editing controls', () => {
    const onLink = vi.fn();
    const { container } = render(
      <ScriptrRenderer document={document} onInternalDocumentLink={onLink} />,
    );

    expect(
      screen.getByRole('heading', { name: 'The Seven Seals', level: 2 }),
    ).toBeInTheDocument();
    screen.getByRole('link', { name: 'The Day of the Lord' }).click();
    expect(onLink).toHaveBeenCalledWith('day-of-the-lord');
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(container.querySelector('.scriptr-editor__history')).toBeNull();
  });
});
