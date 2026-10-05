/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDocumentCodec } from '../document/codec.js';
import type { CanonicalDocument } from '../document/types.js';
import { ScriptrEditor, type ScriptrEditorHandle } from './editor.js';
import { ScriptrRenderer } from './renderer.js';

afterEach(cleanup);

// jsdom has no text layout; ProseMirror focus/scroll commands need these bounds.
const bounds = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
for (const prototype of [Range.prototype, Text.prototype]) {
  Object.defineProperty(prototype, 'getClientRects', {
    configurable: true,
    value: () => [bounds],
  });
  Object.defineProperty(prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => bounds,
  });
}

const mixedDocument: CanonicalDocument = {
  version: 2,
  references: {
    source: {
      id: 'source',
      title: 'Study note',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'A retained annotation.' }],
        },
      ],
    },
  },
  content: [
    {
      id: 'marked',
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Emphasis',
          marks: [{ type: 'bold' }, { type: 'accent' }],
        },
        {
          type: 'text',
          text: ' source',
          marks: [{ type: 'reference', referenceId: 'source' }],
        },
        {
          type: 'text',
          text: ' link',
          marks: [{ type: 'link', href: 'https://example.com/' }],
        },
        {
          type: 'text',
          text: ' related',
          marks: [{ type: 'internalDocumentLink', targetId: 'related' }],
        },
      ],
    },
    {
      id: 'toggle',
      type: 'toggle',
      defaultOpen: true,
      summary: [{ type: 'text', text: 'Nested study' }],
      content: [
        {
          id: 'list',
          type: 'list',
          kind: 'numbered',
          start: 1,
          items: [
            {
              id: 'item',
              content: [{ type: 'text', text: 'A nested observation' }],
            },
          ],
        },
      ],
    },
    {
      id: 'end',
      type: 'paragraph',
      content: [{ type: 'text', text: 'End of study' }],
    },
  ],
};

describe('combined editor features', () => {
  it('preserves surrounding annotations when creating media and undoing or redoing it', async () => {
    const ref = createRef<ScriptrEditorHandle>();
    const onChange = vi.fn<(document: CanonicalDocument) => void>();
    render(
      <ScriptrEditor
        ref={ref}
        defaultValue={mixedDocument}
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(ref.current).not.toBeNull());
    act(() => {
      ref.current?.navigateTo(
        { blockId: 'end', kind: 'text', offset: 12, length: 0 },
        { highlightMs: 0 },
      );
      ref.current?.insertAudio({
        id: 'new-audio',
        type: 'audio',
        assetId: 'audio',
        title: 'Teaching',
        transcript: [{ type: 'text', text: 'Authored transcript' }],
      });
    });
    await waitFor(() =>
      expect(
        onChange.mock.calls
          .at(-1)?.[0]
          .content.some(({ type }) => type === 'audio'),
      ).toBe(true),
    );
    const created = onChange.mock.calls.at(-1)?.[0];
    expect(created?.references).toEqual(mixedDocument.references);
    act(() => ref.current?.undo());
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]).toEqual(mixedDocument),
    );
    act(() => ref.current?.redo());
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]).toEqual(created),
    );
  });
  it('transfers nested structures, Scripture and media through whole-document clipboard', async () => {
    const sourceDocument: CanonicalDocument = {
      ...mixedDocument,
      content: [
        ...mixedDocument.content.slice(0, -1),
        {
          id: 'scripture',
          type: 'scripture',
          address: { book: 'GEN', chapter: 1, verseStart: 1 },
          translationId: 'kjv',
        },
        {
          id: 'comparison',
          type: 'translationComparison',
          address: { book: 'GEN', chapter: 1, verseStart: 1 },
          translationIds: ['kjv', 'web'],
          layout: 'twoColumn',
        },
        {
          id: 'image',
          type: 'image',
          assetId: 'image',
          alt: 'An image',
          alignment: 'center',
        },
        { id: 'audio', type: 'audio', assetId: 'audio', title: 'Teaching' },
        {
          id: 'video',
          type: 'video',
          assetId: 'video',
          title: 'Teaching video',
        },
        {
          id: 'bookmark',
          type: 'webBookmark',
          url: 'https://example.com/',
          title: 'Resource',
        },
        ...mixedDocument.content.slice(-1),
      ],
    };
    const first = createRef<ScriptrEditorHandle>();
    const second = createRef<ScriptrEditorHandle>();
    const onChange = vi.fn<(document: CanonicalDocument) => void>();
    render(
      <>
        <ScriptrEditor
          ref={first}
          defaultValue={sourceDocument}
          ariaLabel="Whole source"
        />
        <ScriptrEditor
          ref={second}
          onChange={onChange}
          ariaLabel="Whole target"
        />
      </>,
    );
    await waitFor(() => expect(second.current).not.toBeNull());
    act(() => first.current?.selectAll());
    const clipboard = new Map<string, string>();
    fireEvent.copy(screen.getByLabelText('Whole source'), {
      clipboardData: {
        clearData: () => clipboard.clear(),
        setData: (type: string, value: string) => clipboard.set(type, value),
      },
    });
    act(() => second.current?.selectAll());
    fireEvent.paste(screen.getByLabelText('Whole target'), {
      clipboardData: {
        getData: (type: string) => clipboard.get(type) ?? '',
        types: [...clipboard.keys()],
        files: [],
      },
    });
    await waitFor(() =>
      expect(
        onChange.mock.calls.at(-1)?.[0].content.map(({ type }) => type),
      ).toEqual(sourceDocument.content.map(({ type }) => type)),
    );
    const pasted = onChange.mock.calls.at(-1)?.[0];
    expect(createDocumentCodec().parse(pasted)).toEqual(pasted);
    for (const original of sourceDocument.content.slice(2, -1)) {
      const received = pasted?.content.find(
        ({ type }) => type === original.type,
      );
      expect(received?.id).toEqual(expect.any(String));
      expect(received).toMatchObject({ ...original, id: received?.id });
    }
    expect(Object.values(pasted?.references ?? {})[0]?.title).toBe(
      'Study note',
    );
  });
  it('retains annotated content across duplication, deletion and their history', async () => {
    const ref = createRef<ScriptrEditorHandle>();
    const onChange = vi.fn<(document: CanonicalDocument) => void>();
    render(
      <ScriptrEditor
        ref={ref}
        defaultValue={mixedDocument}
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(ref.current).not.toBeNull());
    fireEvent.click(screen.getByLabelText('Drag block to reorder'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0].content).toHaveLength(4),
    );
    const duplicated = onChange.mock.calls.at(-1)?.[0];
    expect(createDocumentCodec().parse(duplicated)).toEqual(duplicated);
    expect(duplicated?.references).toEqual(mixedDocument.references);
    act(() => ref.current?.undo());
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]).toEqual(mixedDocument),
    );
    act(() => ref.current?.redo());
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]).toEqual(duplicated),
    );
    fireEvent.click(screen.getByLabelText('Drag block to reorder'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0].content).toHaveLength(3),
    );
    act(() => ref.current?.undo());
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]).toEqual(duplicated),
    );
  });
  it('hydrates mixed read-only content without losing annotations or layout semantics', async () => {
    const host = document.createElement('div');
    const element = <ScriptrRenderer document={mixedDocument} />;
    host.innerHTML = renderToString(element);
    document.body.append(host);
    const errors: unknown[] = [];
    const root = hydrateRoot(host, element, {
      onRecoverableError: (error) => errors.push(error),
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(errors).toEqual([]);
    expect(host.querySelector('details')).toHaveAttribute('open');
    expect(host.querySelector('ol')).toHaveTextContent('A nested observation');
    expect(
      host.querySelector('[data-reference-id="source"]'),
    ).toHaveTextContent('source');
    expect(host.querySelector('[data-scriptr-reference-data]')).toBeNull();
    act(() => root.unmount());
    host.remove();
  });
  it('restores newly created Reference data on redo after undo', async () => {
    const ref = createRef<ScriptrEditorHandle>();
    const onChange = vi.fn<(document: CanonicalDocument) => void>();
    render(
      <ScriptrEditor
        ref={ref}
        defaultValue={mixedDocument}
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(ref.current).not.toBeNull());
    act(() => {
      ref.current?.navigateTo(
        { blockId: 'end', kind: 'text', offset: 0, length: 3 },
        { highlightMs: 0 },
      );
      ref.current?.addReference({
        id: 'new',
        title: 'New annotation',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'New content' }],
          },
        ],
      });
    });
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0].references?.new?.title).toBe(
        'New annotation',
      ),
    );
    act(() => ref.current?.undo());
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0].references?.new).toBeUndefined(),
    );
    act(() => ref.current?.redo());
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0].references?.new?.title).toBe(
        'New annotation',
      ),
    );
  });
  it('restores Reference metadata when undoing removal', async () => {
    const ref = createRef<ScriptrEditorHandle>();
    const onChange = vi.fn<(document: CanonicalDocument) => void>();
    render(
      <ScriptrEditor
        ref={ref}
        defaultValue={mixedDocument}
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(ref.current).not.toBeNull());
    act(() => ref.current?.removeReference('source'));
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0].references).toBeUndefined(),
    );
    act(() => ref.current?.undo());
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0].references).toEqual(
        mixedDocument.references,
      ),
    );
    act(() => ref.current?.redo());
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0].references).toBeUndefined(),
    );
  });

  it('makes Reference metadata edits undoable without changing the anchor text', async () => {
    const ref = createRef<ScriptrEditorHandle>();
    const onChange = vi.fn<(document: CanonicalDocument) => void>();
    render(
      <ScriptrEditor
        ref={ref}
        defaultValue={mixedDocument}
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(ref.current).not.toBeNull());
    const reference = mixedDocument.references?.source;
    if (!reference) throw new Error('Expected fixture Reference');
    act(() =>
      ref.current?.updateReference({ ...reference, title: 'Revised note' }),
    );
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0].references?.source?.title).toBe(
        'Revised note',
      ),
    );
    act(() => ref.current?.undo());
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0].references).toEqual(
        mixedDocument.references,
      ),
    );
    expect(onChange.mock.calls.at(-1)?.[0].content[0]).toEqual(
      mixedDocument.content[0],
    );
  });

  it('copies marked text and Reference content between editors without identity collisions', async () => {
    const first = createRef<ScriptrEditorHandle>();
    const second = createRef<ScriptrEditorHandle>();
    const onChange = vi.fn<(document: CanonicalDocument) => void>();
    render(
      <>
        <ScriptrEditor
          ref={first}
          defaultValue={mixedDocument}
          ariaLabel="Copy source"
        />
        <ScriptrEditor
          ref={second}
          defaultValue={mixedDocument}
          onChange={onChange}
          ariaLabel="Paste target"
        />
      </>,
    );
    await waitFor(() => expect(second.current).not.toBeNull());
    const clipboard = new Map<string, string>();
    act(() => {
      first.current?.navigateTo(
        { blockId: 'marked', kind: 'text', offset: 0, length: 34 },
        { highlightMs: 0 },
      );
    });
    fireEvent.copy(screen.getByLabelText('Copy source'), {
      clipboardData: {
        clearData: () => clipboard.clear(),
        setData: (type: string, value: string) => clipboard.set(type, value),
      },
    });
    expect(clipboard.get('text/html')).toContain('data-scriptr-reference-data');
    act(() => {
      second.current?.navigateTo(
        { blockId: 'end', kind: 'text', offset: 12, length: 0 },
        { highlightMs: 0 },
      );
    });
    fireEvent.paste(screen.getByLabelText('Paste target'), {
      clipboardData: {
        getData: (type: string) => clipboard.get(type) ?? '',
        types: [...clipboard.keys()],
        files: [],
      },
    });
    await waitFor(() =>
      expect(
        Object.keys(onChange.mock.calls.at(-1)?.[0].references ?? {}),
      ).toHaveLength(2),
    );
    const pasted = onChange.mock.calls.at(-1)?.[0];
    const references = Object.values(pasted?.references ?? {});
    expect(references.every(({ title }) => title === 'Study note')).toBe(true);
    expect(new Set(references.map(({ id }) => id)).size).toBe(2);
    expect(createDocumentCodec().parse(pasted)).toEqual(pasted);
    act(() => second.current?.undo());
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0].references).toEqual(
        mixedDocument.references,
      ),
    );
  });
  it('preserves marks, links, annotations and nested lists through movement and history', async () => {
    const ref = createRef<ScriptrEditorHandle>();
    const onChange = vi.fn<(document: CanonicalDocument) => void>();
    render(
      <ScriptrEditor
        ref={ref}
        defaultValue={mixedDocument}
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(ref.current).not.toBeNull());
    act(() => {
      ref.current?.navigateTo(
        { blockId: 'marked', kind: 'text', offset: 0, length: 0 },
        { highlightMs: 0 },
      );
      ref.current?.moveCurrentBlock(1);
    });
    await waitFor(() =>
      expect(
        onChange.mock.calls.at(-1)?.[0].content.map(({ id }) => id),
      ).toEqual(['toggle', 'marked', 'end']),
    );
    const moved = onChange.mock.calls.at(-1)?.[0];
    expect(moved?.content[1]).toEqual(mixedDocument.content[0]);
    expect(moved?.references).toEqual(mixedDocument.references);
    act(() => ref.current?.undo());
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]).toEqual(mixedDocument),
    );
    act(() => ref.current?.redo());
    await waitFor(() => expect(onChange.mock.calls.at(-1)?.[0]).toEqual(moved));
    expect(createDocumentCodec().parse(moved)).toEqual(moved);
  });

  it('keeps simultaneous Strict Mode editors and their history independent', async () => {
    const first = createRef<ScriptrEditorHandle>();
    const second = createRef<ScriptrEditorHandle>();
    const firstChange = vi.fn();
    const secondChange = vi.fn<(document: CanonicalDocument) => void>();
    render(
      <StrictMode>
        <ScriptrEditor
          ref={first}
          defaultValue={mixedDocument}
          onChange={firstChange}
          ariaLabel="First document"
        />
        <ScriptrEditor
          ref={second}
          defaultValue={mixedDocument}
          onChange={secondChange}
          ariaLabel="Second document"
        />
      </StrictMode>,
    );
    await waitFor(() => expect(second.current).not.toBeNull());
    act(() => {
      first.current?.navigateTo(
        { blockId: 'end', kind: 'text', offset: 0, length: 0 },
        { highlightMs: 0 },
      );
    });
    fireEvent.keyDown(screen.getByLabelText('First document'), { key: 'Tab' });
    await waitFor(() => expect(firstChange).toHaveBeenCalled());
    for (const [value] of secondChange.mock.calls)
      expect(value).toEqual(mixedDocument);
    expect(screen.getByLabelText('Second document')).toHaveTextContent(
      'End of study',
    );
    act(() => first.current?.undo());
    await waitFor(() =>
      expect(firstChange.mock.calls.at(-1)?.[0]).toEqual(mixedDocument),
    );
    for (const [value] of secondChange.mock.calls)
      expect(value).toEqual(mixedDocument);
  });
});
