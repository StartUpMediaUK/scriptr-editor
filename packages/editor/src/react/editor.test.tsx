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
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('dismisses the block action menu when focus moves elsewhere or the page scrolls', async () => {
    render(<ScriptrEditor value={document} />);
    const handle = await screen.findByLabelText('Drag block to reorder');

    fireEvent.click(handle);
    expect(screen.getByText('Turn into text')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByLabelText('Document editor'));
    await waitFor(() =>
      expect(screen.queryByText('Turn into text')).toBeNull(),
    );

    fireEvent.click(handle);
    expect(screen.getByText('Turn into text')).toBeInTheDocument();
    fireEvent.scroll(window);
    await waitFor(() =>
      expect(screen.queryByText('Turn into text')).toBeNull(),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
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

  it('creates and edits a validated external link', async () => {
    const rect = {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
    };
    Object.defineProperty(Text.prototype, 'getClientRects', {
      configurable: true,
      value: () => [rect],
    });
    Object.defineProperty(Text.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    });
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [rect],
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    });
    const editorRef = createRef<ScriptrEditorHandle>();
    render(<ScriptrEditor defaultValue={document} ref={editorRef} />);
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    act(() => {
      editorRef.current?.navigateTo(
        { blockId: 'paragraph', kind: 'text', offset: 0, length: 5 },
        { highlightMs: 0 },
      );
    });

    const linkButton = await screen.findByRole('button', { name: 'Link' });
    expect(linkButton.querySelector('svg')).toHaveClass('lucide-link-2');
    fireEvent.click(linkButton);
    const submit = screen.getByRole('button', { name: 'Add link' });
    const url = screen.getByLabelText('Link URL');
    expect(submit).toBeDisabled();
    fireEvent.change(url, { target: { value: 'not a link' } });
    expect(submit).toBeDisabled();
    fireEvent.change(url, { target: { value: 'example.com' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    const anchor = await screen.findByRole('link');
    expect(anchor).toHaveAttribute('href', 'https://example.com/');
    fireEvent.click(anchor);
    expect(await screen.findByLabelText('Link URL')).toHaveValue(
      'https://example.com/',
    );
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
    ).toThrow('Duplicate command id');
  });

  it('renders categorized commands with icons and written notation', async () => {
    const onCommand = vi.fn();
    render(<ScriptrEditor onCommand={onCommand} value={document} />);
    const editor = screen.getByLabelText('Document editor');
    fireEvent.input(editor, { target: { textContent: '/' } });

    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    expect(screen.getByText('Basic')).toBeInTheDocument();
    expect(screen.getByText('Annotation')).toBeInTheDocument();
    expect(screen.getByText('Layout')).toBeInTheDocument();
    expect(screen.getByText('#')).toBeInTheDocument();
    expect(
      screen.getAllByRole('menuitem')[0]?.querySelector('svg'),
    ).not.toBeNull();
    expect(screen.queryByText('Large heading')).not.toBeInTheDocument();

    fireEvent.keyDown(editor, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: /Heading 1/ })).toHaveAttribute(
      'data-selected',
      'true',
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /Reference/ }));
    expect(
      screen.getByRole('dialog', { name: 'Add Reference' }),
    ).toHaveTextContent('Reference name');
    expect(
      screen.getByRole('button', { name: 'Add Reference' }),
    ).toBeDisabled();
    expect(onCommand).not.toHaveBeenCalled();
  });
});
