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
  version: 2,
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
  it('preserves layout order and toggle-heading semantics without editing chrome', () => {
    const { container } = render(
      <ScriptrRenderer
        document={{
          version: 2,
          content: [
            {
              id: 'columns',
              type: 'columns',
              columns: [
                {
                  id: 'left',
                  content: [
                    {
                      id: 'left-text',
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'First column' }],
                    },
                  ],
                },
                {
                  id: 'right',
                  content: [
                    {
                      id: 'right-text',
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Second column' }],
                    },
                  ],
                },
              ],
            },
            {
              id: 'toggle',
              type: 'toggle',
              headingLevel: 2,
              defaultOpen: true,
              summary: [{ type: 'text', text: 'Supporting notes' }],
              content: [
                {
                  id: 'toggle-text',
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Nested detail' }],
                },
              ],
            },
          ],
        }}
      />,
    );

    const columns = container.querySelector('[data-scriptr-columns]');
    expect(columns?.children[0]).toHaveTextContent('First column');
    expect(columns?.children[1]).toHaveTextContent('Second column');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Supporting notes' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Nested detail')).toBeVisible();
    expect(container.querySelector('.scriptr-editor__drag-handle')).toBeNull();
  });

  it('opens available References and preserves unavailable anchor text', () => {
    const onReferenceOpen = vi.fn();
    const referenced: CanonicalDocument = {
      version: 2,
      references: {
        source: {
          id: 'source',
          title: 'Study note',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Supporting detail.' }],
            },
          ],
        },
      },
      content: [
        {
          id: 'reference',
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'available note',
              marks: [{ type: 'reference', referenceId: 'source' }],
            },
            { type: 'text', text: ' and ' },
            {
              type: 'text',
              text: 'missing note',
              marks: [{ type: 'reference', referenceId: 'missing' }],
            },
          ],
        },
      ],
    };
    const { container } = render(
      <ScriptrRenderer
        document={referenced}
        onReferenceOpen={onReferenceOpen}
      />,
    );

    screen.getByRole('button', { name: 'available note' }).click();
    expect(onReferenceOpen).toHaveBeenCalledWith(
      referenced.references?.source,
      'source',
    );
    expect(
      screen.getByRole('button', { name: 'available note' }),
    ).toHaveAttribute('title', 'Study note — Supporting detail.');
    expect(
      container.querySelector('[data-reference-id="missing"]'),
    ).toHaveAttribute('data-reference-state', 'unavailable');
  });

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

  it('preserves every core inline mark in read-only output', () => {
    const { container } = render(
      <ScriptrRenderer
        document={{
          version: 2,
          content: [
            {
              id: 'marks',
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Coloured',
                  marks: [{ type: 'textColour', colour: '#7c3aed' }],
                },
                { type: 'text', text: ' and ' },
                {
                  type: 'text',
                  text: 'highlighted',
                  marks: [{ type: 'highlightColour', colour: '#fde68a' }],
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Coloured')).toHaveStyle({ color: '#7c3aed' });
    expect(screen.getByText('highlighted')).toHaveStyle({
      backgroundColor: '#fde68a',
    });
    expect(
      container.querySelector('[data-scriptr-text-colour]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-scriptr-highlight-colour]'),
    ).toBeInTheDocument();
  });

  it('renders unsafe external URLs as inert authored text', () => {
    const { container } = render(
      <ScriptrRenderer
        document={{
          version: 2,
          content: [
            {
              id: 'unsafe-link',
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Do not run',
                  marks: [{ type: 'link', href: 'javascript:alert(1)' }],
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Do not run' })).toBeNull();
    expect(
      container.querySelector('[data-link-state="unsafe"]'),
    ).toHaveTextContent('Do not run');
  });

  it('renders responsive columns and accessible heading toggles', () => {
    const layoutDocument: CanonicalDocument = {
      version: 2,
      content: [
        {
          id: 'columns',
          type: 'columns',
          columns: [
            {
              id: 'left',
              content: [
                {
                  id: 'left-text',
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Left column' }],
                },
              ],
            },
            {
              id: 'right',
              content: [
                {
                  id: 'right-text',
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Right column' }],
                },
              ],
            },
          ],
        },
        {
          id: 'toggle',
          type: 'toggle',
          headingLevel: 2,
          defaultOpen: true,
          summary: [{ type: 'text', text: 'Heading toggle' }],
          content: [
            {
              id: 'inside',
              type: 'paragraph',
              content: [{ type: 'text', text: 'Inside the toggle' }],
            },
          ],
        },
      ],
    };
    const { container } = render(<ScriptrRenderer document={layoutDocument} />);

    expect(container.querySelectorAll('[data-scriptr-column]')).toHaveLength(2);
    expect(
      screen.getByRole('heading', { name: 'Heading toggle', level: 2 }),
    ).toBeInTheDocument();
    expect(container.querySelector('details')).toHaveAttribute('open');
    expect(screen.getByText('Inside the toggle')).toBeInTheDocument();
  });

  it('renders safe media controls and bookmark metadata', () => {
    const mediaDocument: CanonicalDocument = {
      version: 2,
      content: [
        {
          id: 'video',
          type: 'video',
          src: 'https://example.com/teaching.mp4',
          title: 'Teaching video',
          caption: [{ type: 'text', text: 'Video caption' }],
        },
        {
          id: 'audio',
          type: 'audio',
          src: 'https://example.com/message.mp3',
          title: 'Audio message',
          transcript: [{ type: 'text', text: 'Audio transcript' }],
        },
        {
          id: 'bookmark',
          type: 'webBookmark',
          url: 'https://example.com/article',
          title: 'Further reading',
          description: 'A useful article.',
          siteName: 'Example',
        },
      ],
    };
    const { container } = render(<ScriptrRenderer document={mediaDocument} />);

    expect(container.querySelector('video')).toHaveAttribute('controls');
    expect(container.querySelector('audio')).not.toHaveAttribute('controls');
    expect(
      screen.getByRole('slider', { name: 'Seek audio' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByText('Video caption')).toBeInTheDocument();
    expect(screen.getByText('Audio transcript')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Further reading/ }),
    ).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('renders registered extension blocks and isolates extension failures', () => {
    const onRenderError = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const extensionDocument: CanonicalDocument = {
      version: 2,
      content: [
        {
          id: 'fixture',
          type: 'extension',
          name: 'fixture',
          version: 2,
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
            version: 2,
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
            version: 2,
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
