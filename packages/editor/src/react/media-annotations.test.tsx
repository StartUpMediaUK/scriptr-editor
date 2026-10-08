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
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Block, CanonicalDocument } from '../document/types.js';
import type { DocumentChangeDetails } from '../document/changes.js';
import { ScriptrEditor, type ScriptrEditorHandle } from './editor.js';
import { ScriptrRenderer } from './renderer.js';

afterEach(cleanup);
const kinds = ['image', 'video', 'audio'] as const;
function fixture(
  kind: (typeof kinds)[number],
  text = 'First Second',
  rich = true,
): CanonicalDocument {
  const content = text
    ? [
        {
          type: 'text' as const,
          text,
          marks: rich ? [{ type: 'bold' as const }] : undefined,
        },
      ]
    : [];
  const block: Block =
    kind === 'image'
      ? {
          id: kind,
          type: kind,
          assetId: 'asset',
          alt: 'Example',
          alignment: 'center',
          caption: content,
        }
      : kind === 'video'
        ? { id: kind, type: kind, assetId: 'asset', caption: content }
        : {
            id: kind,
            type: kind,
            assetId: 'asset',
            title: 'Recording',
            transcript: content,
          };
  return { version: 2, content: [block] };
}
function anchor(kind: (typeof kinds)[number], offset = 6, length = 6) {
  return {
    blockId: kind,
    field: kind === 'audio' ? ('transcript' as const) : ('caption' as const),
    offset,
    length,
  };
}
const renderAnnotation = () => <time>External label</time>;

describe('media field annotations and provenance', () => {
  it.each(kinds)(
    'retains %s field identity when the block moves through history',
    async (kind) => {
      const ref = createRef<ScriptrEditorHandle>();
      const events: DocumentChangeDetails[] = [];
      const seed = [{ id: 'old-writing', anchors: [anchor(kind)] }];
      const document: CanonicalDocument = {
        version: 2,
        content: [
          {
            id: 'p',
            type: 'paragraph',
            content: [{ type: 'text', text: 'Before media' }],
          },
          ...fixture(kind).content,
        ],
      };
      render(
        <ScriptrEditor
          ref={ref}
          defaultValue={document}
          initialContributions={seed}
          onChangeDetails={(_, details) => events.push(details)}
        />,
      );
      await screen.findByRole('textbox');
      act(() => {
        ref.current?.navigateToAnchor({
          blockId: kind,
          field: 'block',
          offset: 0,
          length: 0,
        });
        ref.current?.moveCurrentBlock(-1);
      });
      expect(events.at(-1)?.contributions).toEqual(seed);
      expect(events.at(-1)?.additions).toEqual([]);
      act(() => ref.current?.undo());
      expect(events.at(-1)?.source).toBe('undo');
      expect(events.at(-1)?.contributions).toEqual(seed);
      act(() => ref.current?.redo());
      expect(events.at(-1)?.source).toBe('redo');
      expect(events.at(-1)?.contributions).toEqual(seed);
    },
  );
  it.each(kinds)(
    'maps %s insertions, typed replacements and partial deletions without adding labels to content',
    async (kind) => {
      const ref = createRef<ScriptrEditorHandle>();
      const events: DocumentChangeDetails[] = [];
      const seed = [{ id: 'old-writing', anchors: [anchor(kind)] }];
      render(
        <ScriptrEditor
          ref={ref}
          defaultValue={fixture(kind, 'First Second', false)}
          initialContributions={seed}
          onChangeDetails={(_, details) => events.push(details)}
        />,
      );
      await screen.findByRole('textbox');
      act(() => {
        ref.current?.navigateToAnchor(anchor(kind));
      });
      const input = await screen.findByLabelText(
        kind === 'image'
          ? 'Image caption'
          : kind === 'audio'
            ? 'Audio transcript'
            : 'video caption',
      );
      fireEvent.change(input, { target: { value: 'First Second extra' } });
      expect(events.at(-1)?.additions[0]?.anchors).toEqual([
        anchor(kind, 12, 6),
      ]);
      const addedId = events.at(-1)?.additions[0]?.id;
      fireEvent.change(input, { target: { value: 'First Changed extra' } });
      expect(events.at(-1)?.additions).toEqual([]);
      expect(events.at(-1)?.kinds).toContain('replacement');
      expect(
        events.at(-1)?.contributions.find(({ id }) => id === 'old-writing')
          ?.anchors,
      ).toEqual([anchor(kind, 6, 7)]);
      expect(
        events.at(-1)?.contributions.find(({ id }) => id === addedId)?.anchors,
      ).toEqual([anchor(kind, 13, 6)]);
      fireEvent.change(input, { target: { value: 'First Chang extra' } });
      expect(events.at(-1)?.kinds).toContain('deletion');
      expect(events.at(-1)?.additions).toEqual([]);
      expect(
        events.at(-1)?.contributions.find(({ id }) => id === 'old-writing')
          ?.anchors,
      ).toEqual([anchor(kind, 6, 5)]);
    },
  );

  it.each(kinds)(
    'supports annotations and first writing in empty %s fields, omitting invalid anchors',
    async (kind) => {
      const ref = createRef<ScriptrEditorHandle>();
      const events: DocumentChangeDetails[] = [];
      render(
        <ScriptrEditor
          ref={ref}
          defaultValue={fixture(kind, '')}
          annotations={[
            { id: 'valid', anchor: anchor(kind, 0, 0) },
            { id: 'invalid', anchor: anchor(kind, 1, 0) },
          ]}
          renderAnnotation={({ id }) => <span>{id}</span>}
          onChangeDetails={(_, details) => events.push(details)}
        />,
      );
      await screen.findByText('valid');
      expect(screen.queryByText('invalid')).toBeNull();
      act(() => {
        expect(ref.current?.navigateToAnchor(anchor(kind, 1, 0))).toBe(false);
        expect(ref.current?.navigateToAnchor(anchor(kind, 0, 0))).toBe(true);
      });
      const input = await screen.findByLabelText(
        kind === 'image'
          ? 'Image caption'
          : kind === 'audio'
            ? 'Audio transcript'
            : 'video caption',
      );
      fireEvent.change(input, { target: { value: 'New writing' } });
      expect(events.at(-1)?.additions[0]?.anchors).toEqual([
        anchor(kind, 0, 11),
      ]);
    },
  );

  it.each(kinds)(
    'renders %s annotations in editor and read-only fields; updates without authored changes',
    async (kind) => {
      const document = fixture(kind);
      const props = {
        annotations: [{ id: 'stamp', anchor: anchor(kind) }],
        renderAnnotation,
      };
      const events: DocumentChangeDetails[] = [];
      const { unmount, rerender } = render(
        <ScriptrEditor
          value={document}
          {...props}
          onChangeDetails={(_, details) => events.push(details)}
        />,
      );
      const label = await screen.findByText('External label');
      expect(label.closest('figcaption')?.textContent).toBe(
        'First External labelSecond',
      );
      expect(label.closest('[contenteditable="false"]')).toBeTruthy();
      rerender(
        <ScriptrEditor
          value={document}
          {...props}
          renderAnnotation={() => <span>Updated label</span>}
          onChangeDetails={(_, details) => events.push(details)}
        />,
      );
      await screen.findByText('Updated label');
      rerender(
        <ScriptrEditor
          value={document}
          annotations={[]}
          renderAnnotation={renderAnnotation}
          onChangeDetails={(_, details) => events.push(details)}
        />,
      );
      await waitFor(() =>
        expect(screen.queryByText('Updated label')).toBeNull(),
      );
      expect(events).toEqual([]);
      unmount();
      render(<ScriptrRenderer document={document} {...props} />);
      expect(
        screen.getByText('External label').closest('figcaption')?.textContent,
      ).toBe('First External labelSecond');
      expect(screen.getByText('Second').closest('strong')).toBeTruthy();
    },
  );

  it.each(kinds)(
    'restores %s field anchors, selects the field, and assigns fresh paste identities through undo/redo',
    async (kind) => {
      const ref = createRef<ScriptrEditorHandle>();
      const events: DocumentChangeDetails[] = [];
      const documents: CanonicalDocument[] = [];
      const seed = [{ id: 'old-writing', anchors: [anchor(kind)] }];
      render(
        <ScriptrEditor
          ref={ref}
          defaultValue={fixture(kind, 'First Second', false)}
          initialContributions={seed}
          annotations={[{ id: 'stamp', anchor: anchor(kind) }]}
          renderAnnotation={renderAnnotation}
          onChangeDetails={(document, details) => {
            documents.push(document);
            events.push(details);
          }}
        />,
      );
      await screen.findByText('External label');
      act(() => expect(ref.current?.navigateToAnchor(anchor(kind))).toBe(true));
      const input = await screen.findByLabelText(
        kind === 'image'
          ? 'Image caption'
          : kind === 'audio'
            ? 'Audio transcript'
            : 'video caption',
      );
      expect(input).toHaveValue('First Second');
      expect(input).toHaveFocus();
      if (!(input instanceof HTMLInputElement))
        throw new Error('Expected caption input');
      expect(input.selectionStart).toBe(6);
      expect(input.selectionEnd).toBe(12);
      expect(
        screen.getByText('External label').closest('[contenteditable="false"]'),
      ).toBeTruthy();
      fireEvent.paste(input, {
        clipboardData: { types: ['text/plain'], getData: () => 'Second' },
      });
      await waitFor(() => expect(events.at(-1)?.source).toBe('paste'));
      const added = events.at(-1)?.additions[0];
      expect(added?.anchors).toEqual([anchor(kind)]);
      expect(added?.id).not.toBe('old-writing');
      expect(events.at(-1)?.removedContributionIds).toEqual(['old-writing']);
      expect(JSON.stringify(documents.at(-1))).not.toContain('External label');
      fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
      expect(events.at(-1)?.source).toBe('undo');
      expect(events.at(-1)?.contributions).toEqual(seed);
      expect(events.at(-1)?.additions).toEqual([]);
      fireEvent.keyDown(input, { key: 'z', ctrlKey: true, shiftKey: true });
      expect(events.at(-1)?.source).toBe('redo');
      expect(events.at(-1)?.contributions).toEqual([added]);
    },
  );

  it.each(kinds)(
    'preserves surviving %s contributions through external updates and flags overwritten provenance',
    async (kind) => {
      const events: DocumentChangeDetails[] = [];
      const seed = [{ id: 'old-writing', anchors: [anchor(kind)] }];
      const props = {
        initialContributions: seed,
        onChangeDetails: (
          _: CanonicalDocument,
          details: DocumentChangeDetails,
        ) => events.push(details),
      };
      const { rerender } = render(
        <ScriptrEditor value={fixture(kind)} {...props} />,
      );
      await screen.findByRole('textbox');
      rerender(
        <ScriptrEditor
          value={fixture(kind, 'First Second remote')}
          {...props}
        />,
      );
      await waitFor(() => expect(events.at(-1)?.source).toBe('external'));
      expect(events.at(-1)?.contributions).toEqual(seed);
      expect(events.at(-1)?.provenance).toBe('complete');
      expect(events.at(-1)?.additions).toEqual([]);
      rerender(
        <ScriptrEditor value={fixture(kind, 'First overwritten')} {...props} />,
      );
      await waitFor(() => expect(events.at(-1)?.provenance).toBe('unresolved'));
      expect(events.at(-1)?.removedContributionIds).toEqual([]);
    },
  );
});
