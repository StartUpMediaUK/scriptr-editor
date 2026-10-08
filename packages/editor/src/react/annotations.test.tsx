/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScriptrEditor } from './editor.js';
import { ScriptrRenderer } from './renderer.js';
import type { ExternalAnnotation } from './annotations.js';
import type { CanonicalDocument } from '../document/types.js';
import { createDocumentCodec } from '../document/codec.js';
import { createRef } from 'react';
import { act } from '@testing-library/react';
import type { ScriptrEditorHandle } from './editor.js';
import type { DocumentChangeDetails } from '../document/changes.js';
import { createFakeScriptureProvider } from '../scripture/fake-provider.js';
import { testStructure } from '../scripture/test-structure.js';

afterEach(cleanup);
const document: CanonicalDocument = {
  version: 2,
  content: [
    {
      id: 'p',
      type: 'paragraph',
      content: [
        { type: 'text', text: 'First Second', marks: [{ type: 'bold' }] },
      ],
    },
  ],
};
const annotations: readonly ExternalAnnotation[] = [
  {
    id: 'stamp',
    anchor: { blockId: 'p', field: 'content', offset: 6, length: 6 },
  },
];
const renderAnnotation = () => <time>External label</time>;

describe('external annotations', () => {
  it('reports browser replacement paste as fresh writing', async () => {
    const ref = createRef<ScriptrEditorHandle>();
    const events: DocumentChangeDetails[] = [];
    render(
      <ScriptrEditor
        ref={ref}
        defaultValue={document}
        initialContributions={[
          {
            id: 'old-writing',
            anchors: [{ blockId: 'p', field: 'content', offset: 6, length: 6 }],
          },
        ]}
        onChangeDetails={(_, details) => events.push(details)}
      />,
    );
    const editor = await screen.findByRole('textbox');
    act(() => {
      ref.current?.navigateToAnchor({
        blockId: 'p',
        field: 'content',
        offset: 6,
        length: 6,
      });
    });
    fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? 'XYZ' : ''),
        types: ['text/plain'],
      },
    });
    await waitFor(() => expect(events.at(-1)?.source).toBe('paste'));
    expect(events.at(-1)?.additions).toHaveLength(1);
    expect(events.at(-1)?.additions[0]?.id).not.toBe('old-writing');
    expect(events.at(-1)?.removedContributionIds).toContain('old-writing');
  });
  it('preserves restored contributions through public controlled value updates', async () => {
    const original: CanonicalDocument = {
      version: 2,
      content: [
        {
          id: 'p',
          type: 'paragraph',
          content: [{ type: 'text', text: 'Old ABC' }],
        },
      ],
    };
    const contributions = [
      {
        id: 'writing',
        anchors: [
          { blockId: 'p', field: 'content' as const, offset: 3, length: 4 },
        ],
      },
    ];
    const events: DocumentChangeDetails[] = [];
    const props = {
      initialContributions: contributions,
      onChangeDetails: (_: CanonicalDocument, details: DocumentChangeDetails) =>
        events.push(details),
    };
    const { rerender } = render(<ScriptrEditor value={original} {...props} />);
    await screen.findByRole('textbox');
    rerender(
      <ScriptrEditor
        value={{
          version: 2,
          content: [
            {
              id: 'p',
              type: 'paragraph',
              content: [{ type: 'text', text: 'Old ABC remote' }],
            },
          ],
        }}
        {...props}
      />,
    );
    await waitFor(() => expect(events.at(-1)?.source).toBe('external'));
    expect(events.at(-1)?.contributions).toEqual(contributions);
    expect(events.at(-1)?.removedContributionIds).toEqual([]);
    expect(events.at(-1)?.provenance).toBe('complete');
  });
  it('classifies existing Scripture configuration changes without adding provider text', async () => {
    const events: DocumentChangeDetails[] = [];
    const provider = createFakeScriptureProvider({
      structure: testStructure,
      translations: [
        { id: 'A', name: 'Example A', abbreviation: 'A', languageTag: 'en' },
        { id: 'B', name: 'Example B', abbreviation: 'B', languageTag: 'en' },
      ],
    });
    render(
      <ScriptrEditor
        scriptureProvider={provider}
        defaultValue={{
          version: 2,
          content: [
            {
              id: 'comparison',
              type: 'translationComparison',
              address: { book: 'ROM', chapter: 8, verseStart: 28 },
              translationIds: ['A', 'B'],
              layout: 'twoColumn',
            },
          ],
        }}
        onChangeDetails={(_, details) => events.push(details)}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'One column' }));
    expect(events.at(-1)?.kinds).toEqual(['scripture']);
    expect(events.at(-1)?.additions).toEqual([]);
  });

  it('copies authored text without external labels', async () => {
    const ref = createRef<ScriptrEditorHandle>();
    render(
      <ScriptrEditor
        ref={ref}
        defaultValue={document}
        annotations={annotations}
        renderAnnotation={renderAnnotation}
      />,
    );
    await screen.findByText('External label');
    act(() => ref.current?.selectAll());
    const copied = new Map<string, string>();
    fireEvent.copy(screen.getByRole('textbox'), {
      clipboardData: {
        clearData: () => copied.clear(),
        setData: (type: string, value: string) => copied.set(type, value),
      },
    });
    expect(copied.get('text/plain')).toContain('First Second');
    expect(copied.get('text/plain')).not.toContain('External label');
    expect(copied.get('text/html')).not.toContain('External label');
  });
  it('classifies Reference metadata changes without new contributions', async () => {
    const ref = createRef<ScriptrEditorHandle>();
    const events: DocumentChangeDetails[] = [];
    render(
      <ScriptrEditor
        ref={ref}
        defaultValue={document}
        onChangeDetails={(_, details) => events.push(details)}
      />,
    );
    await screen.findByRole('textbox');
    act(() => {
      ref.current?.navigateToAnchor({
        blockId: 'p',
        field: 'content',
        offset: 6,
        length: 6,
      });
    });
    const reference = {
      id: 'reference',
      title: 'Note',
      content: [{ type: 'paragraph' as const, content: [] }],
    };
    act(() => ref.current?.addReference(reference));
    expect(events.at(-1)?.kinds).toEqual(['reference']);
    expect(events.at(-1)?.additions).toEqual([]);
    act(() => ref.current?.updateReference({ ...reference, title: 'Updated' }));
    expect(events.at(-1)?.kinds).toEqual(['reference']);
    expect(events.at(-1)?.additions).toEqual([]);
  });

  it('reports controlled document replacement as external without calling the ordinary user callback', async () => {
    const events: DocumentChangeDetails[] = [];
    let userChanges = 0;
    const props = {
      onChangeDetails: (_: CanonicalDocument, details: DocumentChangeDetails) =>
        events.push(details),
      onChange: () => {
        userChanges++;
      },
    };
    const { rerender } = render(<ScriptrEditor value={document} {...props} />);
    await screen.findByRole('textbox');
    const initialChanges = userChanges;
    rerender(
      <ScriptrEditor
        value={{
          version: 2,
          content: [
            {
              id: 'other',
              type: 'paragraph',
              content: [{ type: 'text', text: 'External content' }],
            },
          ],
        }}
        {...props}
      />,
    );
    await waitFor(() => expect(events.at(-1)?.source).toBe('external'));
    expect(events.at(-1)?.additions).toEqual([]);
    expect(userChanges).toBe(initialChanges);
  });
  it('exposes typed details through the public editor and preserves atom identity through history', async () => {
    const ref = createRef<ScriptrEditorHandle>();
    const events: DocumentChangeDetails[] = [];
    render(
      <ScriptrEditor
        ref={ref}
        defaultValue={document}
        trackChanges
        onChangeDetails={(_, details) => events.push(details)}
      />,
    );
    await screen.findByRole('textbox');
    act(() =>
      ref.current?.insertImage({
        id: 'image',
        type: 'image',
        assetId: 'asset',
        alignment: 'center',
        alt: 'Example',
      }),
    );
    const added = events.at(-1);
    expect(added?.additions[0]?.anchors[0]?.blockId).toBe('image');
    act(() => ref.current?.undo());
    expect(events.at(-1)?.source).toBe('undo');
    expect(events.at(-1)?.removedContributionIds).toContain(
      added?.additions[0]?.id,
    );
    act(() => ref.current?.redo());
    expect(events.at(-1)?.source).toBe('redo');
    expect(events.at(-1)?.restoredContributionIds).toContain(
      added?.additions[0]?.id,
    );
  });
  it('renders at the same mid-paragraph position without changing authored content', async () => {
    const { unmount } = render(
      <ScriptrEditor
        value={document}
        annotations={annotations}
        renderAnnotation={renderAnnotation}
      />,
    );
    const label = await screen.findByText('External label');
    expect(label.closest('[contenteditable="false"]')).toBeTruthy();
    expect(label.closest('p')?.textContent).toBe('First External labelSecond');
    expect(createDocumentCodec().serialize(document)).not.toContain(
      'External label',
    );
    unmount();
    render(
      <ScriptrRenderer
        document={document}
        annotations={annotations}
        renderAnnotation={renderAnnotation}
      />,
    );
    expect(screen.getByText('External label').closest('p')?.textContent).toBe(
      'First External labelSecond',
    );
    expect(screen.getByText('Second').closest('strong')).toBeTruthy();
  });

  it('updates host labels and removes annotations without editing the document', async () => {
    const { rerender } = render(
      <ScriptrEditor
        value={document}
        annotations={annotations}
        renderAnnotation={renderAnnotation}
      />,
    );
    await screen.findByText('External label');
    rerender(
      <ScriptrEditor
        value={document}
        annotations={annotations}
        renderAnnotation={() => <span>Updated label</span>}
      />,
    );
    await screen.findByText('Updated label');
    rerender(
      <ScriptrEditor
        value={document}
        annotations={[]}
        renderAnnotation={renderAnnotation}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByText('Updated label')).not.toBeInTheDocument(),
    );
  });

  it('does not guess a position for unresolved anchors', () => {
    render(
      <ScriptrRenderer
        document={document}
        annotations={[
          {
            id: 'missing',
            anchor: {
              blockId: 'missing',
              field: 'content',
              offset: 0,
              length: 0,
            },
          },
        ]}
        renderAnnotation={renderAnnotation}
      />,
    );
    expect(screen.queryByText('External label')).not.toBeInTheDocument();
  });
});
