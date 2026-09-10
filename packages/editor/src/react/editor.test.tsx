/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRef, StrictMode } from 'react';

import type { CanonicalDocument } from '../document/types.js';
import { ScriptrEditor } from './editor.js';
import type { ScriptrEditorHandle } from './editor.js';

const document: CanonicalDocument = {
  version: 2,
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

  it('navigates to a stable canonical location and temporarily highlights it', async () => {
    const editorRef = createRef<ScriptrEditorHandle>();
    render(<ScriptrEditor ref={editorRef} value={document} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    let found = false;
    act(() => {
      found =
        editorRef.current?.navigateTo(
          { blockId: 'paragraph', kind: 'text', offset: 2, length: 5 },
          { highlightMs: 0 },
        ) ?? false;
    });
    expect(found).toBe(true);
  });

  it('mounts multiple Strict Mode editors independently', async () => {
    render(
      <StrictMode>
        <ScriptrEditor value={document} />
        <ScriptrEditor value={document} />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(screen.getAllByLabelText('Document editor')).toHaveLength(2),
    );
  });

  it('retains automatic direction and a representative large document', async () => {
    const largeDocument: CanonicalDocument = {
      version: 2,
      content: Array.from({ length: 200 }, (_, index) => ({
        id: `paragraph-${index}`,
        type: 'paragraph' as const,
        content: [
          {
            type: 'text' as const,
            text: index === 199 ? 'שלום' : `Paragraph ${index}`,
          },
        ],
      })),
    };
    render(<ScriptrEditor value={largeDocument} />);
    await waitFor(() =>
      expect(screen.getByLabelText('Document editor')).toHaveTextContent(
        'שלום',
      ),
    );
    expect(screen.getByLabelText('Document editor')).toHaveAttribute(
      'dir',
      'auto',
    );
  });

  it('renders a registered third-party block in the authoring surface', async () => {
    render(
      <ScriptrEditor
        extensions={[
          {
            name: 'fixture',
            version: 2,
            parseData: () => ({ message: 'hello' }),
            renderReadonly: () => 'Read only',
            renderEditable: () => 'Editable extension',
          },
        ]}
        value={{
          version: 2,
          content: [
            {
              id: 'extension',
              type: 'extension',
              name: 'fixture',
              version: 2,
              data: { message: 'hello' },
            },
          ],
        }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText('Editable extension')).toBeInTheDocument(),
    );
  });

  it('rejects conflicting contributed slash items', () => {
    const extension = {
      name: 'fixture',
      version: 2,
      parseData: () => null,
      renderReadonly: () => null,
      slashItems: [
        {
          id: 'insert',
          label: 'Fixture',
          hint: 'Insert fixture',
          createBlock: () => ({
            id: 'fixture',
            type: 'extension' as const,
            name: 'fixture',
            version: 2,
            data: null,
          }),
        },
      ],
    };
    expect(() =>
      render(
        <ScriptrEditor extensions={[extension, extension]} value={document} />,
      ),
    ).toThrow('Duplicate extension slash item');
  });
});
