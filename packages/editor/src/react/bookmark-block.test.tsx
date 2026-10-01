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

import { BookmarkBlockContent, BookmarkComposer } from './bookmark-block.js';

afterEach(cleanup);

describe('bookmark blocks', () => {
  it('normalizes a URL and resolves host-owned metadata before insertion', async () => {
    const resolve = vi.fn(() =>
      Promise.resolve({
        url: 'https://example.com/article',
        title: 'Further reading',
        siteName: 'Example',
      }),
    );
    const onAdd = vi.fn();
    render(
      <BookmarkComposer
        createBlockId={() => 'bookmark'}
        onAdd={onAdd}
        onCancel={vi.fn()}
        provider={{ resolve }}
      />,
    );
    fireEvent.change(screen.getByLabelText('Bookmark URL'), {
      target: { value: 'example.com/article' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add bookmark' }));

    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({
        id: 'bookmark',
        type: 'webBookmark',
        url: 'https://example.com/article',
        title: 'Further reading',
        description: undefined,
        siteName: 'Example',
        imageAssetId: undefined,
      }),
    );
    expect(resolve).toHaveBeenCalledWith(
      'https://example.com/article',
      expect.any(AbortSignal),
    );
  });

  it('renders an external bookmark with safe link attributes', () => {
    render(
      <BookmarkBlockContent
        block={{
          id: 'bookmark',
          type: 'webBookmark',
          url: 'https://example.com/article',
          title: 'Further reading',
          description: 'A useful article.',
        }}
      />,
    );
    expect(
      screen.getByRole('link', { name: /Further reading/ }),
    ).toHaveAttribute('target', '_blank');
  });

  it('keeps removal contextual and refuses unsafe persisted URLs', () => {
    const onRemove = vi.fn();
    render(
      <BookmarkBlockContent
        block={{
          id: 'bookmark',
          type: 'webBookmark',
          url: 'javascript:alert(1)',
          title: 'Unsafe bookmark',
        }}
        editable
        onRemove={onRemove}
      />,
    );
    const disabledAnchor = screen.getByText('Unsafe bookmark').closest('a');
    expect(disabledAnchor).not.toHaveAttribute('href');
    expect(disabledAnchor).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
