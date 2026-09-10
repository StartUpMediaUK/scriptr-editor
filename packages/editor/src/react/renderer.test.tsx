/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

import type { CanonicalDocument } from '../document/types.js';
import { createFakeScriptureProvider } from '../scripture/fake-provider.js';
import { testStructure } from '../scripture/test-structure.js';
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
    {
      id: 'scripture',
      type: 'scripture',
      address: { book: 'ROM', chapter: 8, verseStart: 28 },
      translationId: 'KJV',
    },
    {
      id: 'comparison',
      type: 'translationComparison',
      address: { book: 'ROM', chapter: 8, verseStart: 28 },
      translationIds: ['KJV', 'WEB'],
      layout: 'twoColumn',
    },
  ],
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
  passages: [
    {
      address: { book: 'ROM', chapter: 8, verseStart: 28 },
      translationId: 'KJV',
      text: 'All things work together for good.',
      attribution: 'King James Version — test fixture',
      cache: 'persistent',
    },
    {
      address: { book: 'ROM', chapter: 8, verseStart: 28 },
      translationId: 'WEB',
      text: 'All things work together for good to those who love God.',
      attribution: 'World English Bible — test fixture',
      cache: 'persistent',
    },
  ],
});

afterEach(cleanup);

describe('ScriptrRenderer', () => {
  it('preserves authored hierarchy without editing controls', async () => {
    const onLink = vi.fn();
    const { container } = render(
      <ScriptrRenderer
        document={document}
        onInternalDocumentLink={onLink}
        scriptureProvider={provider}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'The Seven Seals', level: 2 }),
    ).toBeInTheDocument();
    screen.getByRole('link', { name: 'The Day of the Lord' }).click();
    expect(onLink).toHaveBeenCalledWith('day-of-the-lord');
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(container.querySelector('.scriptr-editor__history')).toBeNull();
    await waitFor(() => {
      expect(
        screen.getAllByText('King James Version — test fixture'),
      ).toHaveLength(2);
    });
    expect(
      screen.getByText('World English Bible — test fixture'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-layout="twoColumn"]'),
    ).toBeInTheDocument();
  });

  it('retains authored link text when the host target is unavailable', async () => {
    const onLink = vi.fn();
    render(
      <ScriptrRenderer
        document={document}
        documentTargetProvider={{
          search: () => Promise.resolve([]),
          resolve: () => Promise.resolve(undefined),
        }}
        onInternalDocumentLink={onLink}
      />,
    );
    const link = screen.getByRole('link', { name: 'The Day of the Lord' });
    await waitFor(() => expect(link).toHaveAttribute('aria-disabled', 'true'));
    link.click();
    expect(onLink).not.toHaveBeenCalled();
    expect(link).toHaveTextContent('The Day of the Lord');
  });

  it('renders registered extension blocks and isolates extension failures', () => {
    const onRenderError = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const extensionDocument: CanonicalDocument = {
      version: 1,
      content: [
        {
          id: 'fixture',
          type: 'extension',
          name: 'fixture',
          version: 1,
          data: { message: 'Portable' },
        },
      ],
    };
    const { rerender } = render(
      <ScriptrRenderer
        document={extensionDocument}
        extensions={[
          {
            name: 'fixture',
            version: 1,
            parseData: (input) =>
              input === null ? null : { message: 'Portable' },
            renderReadonly: () => <p>Portable extension</p>,
          },
        ]}
        onRenderError={onRenderError}
      />,
    );
    expect(screen.getByText('Portable extension')).toBeInTheDocument();
    rerender(
      <ScriptrRenderer
        document={extensionDocument}
        extensions={[
          {
            name: 'fixture',
            version: 1,
            parseData: () => null,
            renderReadonly: () => {
              throw new Error('Broken extension');
            },
          },
        ]}
        onRenderError={onRenderError}
      />,
    );
    expect(
      screen.getByText('This content could not be displayed.'),
    ).toBeInTheDocument();
    expect(onRenderError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('supports server-side read-only rendering without browser globals', () => {
    expect(renderToString(<ScriptrRenderer document={document} />)).toContain(
      'The Seven Seals',
    );
  });
});
