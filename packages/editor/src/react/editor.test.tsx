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
import { normalizeExternalUrl } from '../document/external-links.js';
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
  it('does not intercept media downloads as authored external links', async () => {
    render(
      <ScriptrEditor
        defaultValue={{
          version: 2,
          content: [
            {
              id: 'image',
              type: 'image',
              assetId: 'example-image',
              alignment: 'center',
              src: 'https://example.com/image.png',
              alt: 'Example',
            },
          ],
        }}
      />,
    );
    const download = await screen.findByRole('link', {
      name: 'Download image',
    });
    const surface = await screen.findByRole('textbox', {
      name: 'Document editor',
    });
    let intercepted = true;
    surface.addEventListener(
      'click',
      (event) => {
        intercepted = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true },
    );
    fireEvent.click(download);
    expect(intercepted).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the empty multiline writing surface explicitly', async () => {
    render(
      <ScriptrEditor
        defaultValue={{
          version: 2,
          content: [{ id: 'empty', type: 'paragraph', content: [] }],
        }}
      />,
    );
    expect(
      await screen.findByRole('textbox', { name: 'Document editor' }),
    ).toHaveAttribute('aria-multiline', 'true');
  });

  it('normalizes safe external links and rejects unsafe schemes', () => {
    expect(normalizeExternalUrl('example.com/path')).toBe(
      'https://example.com/path',
    );
    expect(normalizeExternalUrl('mailto:reader@example.com')).toBe(
      'mailto:reader@example.com',
    );
    expect(normalizeExternalUrl('javascript:alert(1)')).toBeUndefined();
    expect(normalizeExternalUrl('data:text/html,test')).toBeUndefined();
  });

  it('opens, edits, and removes an existing Reference without deleting its text', async () => {
    const onChange = vi.fn();
    const referenced: CanonicalDocument = {
      version: 2,
      references: {
        source: {
          id: 'source',
          title: 'Original source',
          content: [{ type: 'paragraph', content: [] }],
        },
      },
      content: [
        {
          id: 'paragraph',
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Before ' },
            {
              type: 'text',
              text: 'anchored words',
              marks: [{ type: 'reference', referenceId: 'source' }],
            },
            { type: 'text', text: '.' },
          ],
        },
      ],
    };
    const { container } = render(
      <ScriptrEditor defaultValue={referenced} onChange={onChange} />,
    );
    const anchor = await waitFor(() => {
      const element = container.querySelector('[data-scriptr-reference]');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });

    fireEvent.click(anchor);
    const dialog = screen.getByRole('dialog', { name: 'Edit Reference' });
    expect(dialog.querySelectorAll('[data-slot="dialog-close"]')).toHaveLength(
      1,
    );
    expect(
      screen.getByLabelText('Reference name').parentElement,
    ).not.toHaveClass('scriptr-editor__workflow-field');
    fireEvent.change(screen.getByLabelText('Reference name'), {
      target: { value: 'Revised source' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Reference' }));
    await waitFor(() =>
      expect(
        (onChange.mock.calls.at(-1)?.[0] as CanonicalDocument).references
          ?.source?.title,
      ).toBe('Revised source'),
    );

    fireEvent.click(screen.getByText('anchored words'));
    expect(dialog).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Reference' }));
    await waitFor(() => {
      const changed = onChange.mock.calls.at(-1)?.[0] as CanonicalDocument;
      expect(changed.references).toBeUndefined();
      expect(screen.getByLabelText('Document editor')).toHaveTextContent(
        'anchored words',
      );
    });
  });

  it('opens and removes an existing internal document link', async () => {
    const onChange = vi.fn();
    const linked: CanonicalDocument = {
      version: 2,
      content: [
        {
          id: 'paragraph',
          type: 'paragraph',
          content: [
            { type: 'text', text: 'See ' },
            {
              type: 'text',
              text: 'The Day of the Lord',
              marks: [
                {
                  type: 'internalDocumentLink',
                  targetId: 'day-of-the-lord',
                },
              ],
            },
            { type: 'text', text: '.' },
          ],
        },
      ],
    };
    const { container } = render(
      <ScriptrEditor
        defaultValue={linked}
        documentTargetProvider={{
          search: () =>
            Promise.resolve([
              { id: 'day-of-the-lord', label: 'The Day of the Lord' },
            ]),
          resolve: () =>
            Promise.resolve({
              id: 'day-of-the-lord',
              label: 'The Day of the Lord',
            }),
        }}
        onChange={onChange}
      />,
    );
    const link = await waitFor(() => {
      const element = container.querySelector('[data-scriptr-document-link]');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });

    fireEvent.click(link);
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove document link' }),
    );
    await waitFor(() => {
      const changed = onChange.mock.calls.at(-1)?.[0] as CanonicalDocument;
      expect(JSON.stringify(changed.content[0])).toContain(
        'The Day of the Lord',
      );
      expect(JSON.stringify(changed.content[0])).not.toContain(
        'internalDocumentLink',
      );
      expect(
        container.querySelector('[data-scriptr-document-link]'),
      ).toBeNull();
    });
  });
  it('renders canonical content and accessible editing controls', async () => {
    render(<ScriptrEditor value={document} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Document editor')).toHaveTextContent(
        'A quiet writing surface.',
      );
    });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Drag block to reorder')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move block up' })).toBeNull();
  });

  it('keeps block operations contextual and regenerates authored IDs when duplicating', async () => {
    const onChange = vi.fn();
    render(<ScriptrEditor defaultValue={document} onChange={onChange} />);
    const handle = await screen.findByLabelText('Drag block to reorder');

    fireEvent.click(handle);
    expect(
      screen.getByRole('menuitem', { name: 'Move up' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Duplicate' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const changed = onChange.mock.calls.at(-1)?.[0] as CanonicalDocument;
    expect(changed.content).toHaveLength(2);
    expect(changed.content[0]?.id).toBe('paragraph');
    expect(changed.content[1]?.id).not.toBe('paragraph');
  });

  it('applies controlled document replacements outside the React effect lifecycle', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const replacement: CanonicalDocument = {
      version: 2,
      content: [
        {
          id: 'replacement',
          type: 'paragraph',
          content: [{ type: 'text', text: 'Replacement content.' }],
        },
      ],
    };
    const { rerender } = render(
      <StrictMode>
        <ScriptrEditor value={document} />
      </StrictMode>,
    );

    rerender(
      <StrictMode>
        <ScriptrEditor value={replacement} />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Document editor')).toHaveTextContent(
        'Replacement content.',
      ),
    );
    expect(
      consoleError.mock.calls.some(([message]) =>
        String(message).includes('flushSync was called'),
      ),
    ).toBe(false);
    consoleError.mockRestore();
  });

  it('locks scrolling and its drag-handle target while the block menu is open', async () => {
    render(<ScriptrEditor value={document} />);
    const handle = await screen.findByLabelText('Drag block to reorder');

    fireEvent.click(handle);
    expect(
      screen.getByRole('menuitem', { name: 'Turn into' }),
    ).toBeInTheDocument();
    expect(globalThis.document.documentElement.style.overflow).toBe('hidden');
    expect(globalThis.document.documentElement.style.scrollbarGutter).toBe(
      'stable',
    );

    fireEvent.scroll(window);
    expect(
      screen.getByRole('menuitem', { name: 'Turn into' }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByLabelText('Document editor'));
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Turn into' })).toBeNull(),
    );
    expect(globalThis.document.documentElement.style.overflow).toBe('');
    expect(globalThis.document.documentElement.style.scrollbarGutter).toBe('');
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
  });

  it('uses the gutter plus menu to create and transform a following block', async () => {
    const onChange = vi.fn();
    render(<ScriptrEditor defaultValue={document} onChange={onChange} />);
    const insert = await screen.findByLabelText('Insert block');

    fireEvent.click(insert);
    expect(globalThis.document.documentElement.style.overflow).toBe('hidden');
    const headingOption = screen.getByRole('option', { name: /Heading 1/ });
    expect(
      headingOption.querySelector('[data-slot="command-shortcut"]'),
    ).toHaveTextContent('#');
    expect(headingOption.closest('[data-slot="command-list"]')).not.toHaveClass(
      'no-scrollbar',
    );
    fireEvent.click(headingOption);

    await waitFor(() => {
      const changed = onChange.mock.calls.at(-1)?.[0] as
        | CanonicalDocument
        | undefined;
      expect(changed?.content).toHaveLength(2);
      expect(changed?.content[1]?.type).toBe('heading');
    });
    expect(globalThis.document.documentElement.style.overflow).toBe('');
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

  it('hands gutter insertion focus to a workflow without restoring its trigger', async () => {
    render(
      <ScriptrEditor
        defaultValue={document}
        bookmarkProvider={{
          resolve: () =>
            Promise.resolve({ url: 'https://example.com', title: 'Example' }),
        }}
      />,
    );
    fireEvent.click(await screen.findByLabelText('Insert block'));
    fireEvent.click(screen.getByRole('option', { name: /Web bookmark/ }));
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    expect(screen.getByRole('textbox', { name: 'Bookmark URL' })).toHaveFocus();
    expect(globalThis.document.documentElement.style.overflow).toBe('');
  });

  it('creates an empty uncontrolled document when no value is supplied', async () => {
    render(<ScriptrEditor />);

    await waitFor(() => {
      expect(screen.getByLabelText('Document editor')).toHaveTextContent('');
    });
  });

  it('uses Tab for authored indentation and Shift+Tab to remove it', async () => {
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
    Object.defineProperty(Element.prototype, 'getClientRects', {
      configurable: true,
      value: () => [rect],
    });
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [rect],
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    });
    const onChange = vi.fn<(value: CanonicalDocument) => void>();
    const editorRef = createRef<ScriptrEditorHandle>();
    render(
      <ScriptrEditor
        defaultValue={document}
        onChange={onChange}
        ref={editorRef}
      />,
    );
    await waitFor(() => expect(editorRef.current).not.toBeNull());
    act(() => {
      editorRef.current?.navigateTo(
        { blockId: 'paragraph', kind: 'text', offset: 5, length: 0 },
        { highlightMs: 0 },
      );
    });

    const surface = screen.getByLabelText('Document editor');
    fireEvent.keyDown(surface, { key: 'Tab' });
    await waitFor(() => {
      expect(onChange.mock.calls.at(-1)?.[0].content[0]).toMatchObject({
        type: 'paragraph',
        content: [{ type: 'text', text: 'A qui\tet writing surface.' }],
      });
    });

    act(() => editorRef.current?.undo());
    await waitFor(() => {
      expect(onChange.mock.calls.at(-1)?.[0].content[0]).toMatchObject({
        type: 'paragraph',
        content: [{ type: 'text', text: 'A quiet writing surface.' }],
      });
    });
    act(() => editorRef.current?.redo());
    await waitFor(() => {
      expect(onChange.mock.calls.at(-1)?.[0].content[0]).toMatchObject({
        type: 'paragraph',
        content: [{ type: 'text', text: 'A qui\tet writing surface.' }],
      });
    });

    fireEvent.keyDown(surface, { key: 'Tab', shiftKey: true });
    await waitFor(() => {
      expect(onChange.mock.calls.at(-1)?.[0].content[0]).toMatchObject({
        type: 'paragraph',
        content: [{ type: 'text', text: 'A quiet writing surface.' }],
      });
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
    expect(screen.getByLabelText('Search blocks')).toHaveValue('');
    expect(screen.getByText('Basic')).toBeInTheDocument();
    expect(screen.getByText('Annotation')).toBeInTheDocument();
    expect(screen.getByText('Layout')).toBeInTheDocument();
    expect(screen.getAllByText('Scripture')).toHaveLength(2);
    expect(screen.getByText('#')).toBeInTheDocument();
    expect(
      screen.getAllByRole('option')[0]?.querySelector('svg'),
    ).not.toBeNull();
    expect(screen.queryByText('Large heading')).not.toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /Scripture Requires host setup/ }),
    ).toHaveAttribute('data-disabled', 'true');

    fireEvent.keyDown(editor, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Heading 1/ })).toHaveAttribute(
      'data-selected',
      'true',
    );

    fireEvent.click(screen.getByRole('option', { name: /Reference/ }));
    expect(
      screen.getByRole('dialog', { name: 'Add Reference' }),
    ).toHaveTextContent('Reference name');
    expect(
      screen
        .getByRole('dialog', { name: 'Add Reference' })
        .querySelectorAll('[data-slot="dialog-close"]'),
    ).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Add Reference' })).toHaveClass(
      'scriptr-editor__inspector',
    );
    expect(
      screen.getByRole('button', { name: 'Add Reference' }),
    ).toBeDisabled();
    expect(onCommand).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(editor).toHaveFocus());
  });

  it('inserts editable columns and heading toggles from slash commands', async () => {
    const { unmount } = render(<ScriptrEditor value={document} />);
    let editor = screen.getByLabelText('Document editor');
    fireEvent.input(editor, { target: { textContent: '/' } });
    fireEvent.click(await screen.findByRole('option', { name: /Columns/ }));

    await waitFor(() => {
      expect(editor.querySelectorAll('[data-scriptr-column]')).toHaveLength(2);
    });
    unmount();

    render(<ScriptrEditor value={document} />);
    editor = screen.getByLabelText('Document editor');
    fireEvent.input(editor, { target: { textContent: '/' } });
    fireEvent.click(
      await screen.findByRole('option', { name: /Toggle heading 2/ }),
    );

    await waitFor(() => {
      expect(
        editor.querySelector('[data-scriptr-toggle][data-heading-level="2"]'),
      ).toHaveAttribute('open');
    });
  });

  it('moves a nested layout child among its actual siblings', async () => {
    const editorRef = createRef<ScriptrEditorHandle>();
    const onChange = vi.fn();
    render(
      <ScriptrEditor
        defaultValue={{
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
                      id: 'first',
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'First' }],
                    },
                    {
                      id: 'second',
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Second' }],
                    },
                  ],
                },
                {
                  id: 'right',
                  content: [
                    {
                      id: 'right-text',
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Right' }],
                    },
                  ],
                },
              ],
            },
          ],
        }}
        onChange={onChange}
        ref={editorRef}
      />,
    );
    await waitFor(() => expect(editorRef.current).not.toBeNull());

    act(() => {
      editorRef.current?.navigateTo({
        blockId: 'second',
        kind: 'text',
        offset: 0,
        length: 1,
      });
      editorRef.current?.moveCurrentBlock(-1);
    });

    await waitFor(() => {
      const changed = onChange.mock.calls.at(-1)?.[0] as CanonicalDocument;
      const layout = changed.content[0];
      expect(layout?.type).toBe('columns');
      if (layout?.type !== 'columns') return;
      expect(layout.columns[0]?.content.map((block) => block.id)).toEqual([
        'second',
        'first',
      ]);
      expect(layout.columns[1]?.content[0]?.id).toBe('right-text');
    });
  });

  it('opens package-owned media and bookmark workflows from slash commands', async () => {
    const mediaHost = {
      upload: vi.fn(),
      resolve: vi.fn(),
      onRemoved: vi.fn(),
    };
    const bookmarkProvider = {
      resolve: vi.fn(() =>
        Promise.resolve({ url: 'https://example.com', title: 'Example' }),
      ),
    };
    const { unmount } = render(
      <ScriptrEditor
        bookmarkProvider={bookmarkProvider}
        mediaHost={mediaHost}
        value={document}
      />,
    );
    let editor = screen.getByLabelText('Document editor');
    fireEvent.input(editor, { target: { textContent: '/' } });
    fireEvent.click(await screen.findByRole('option', { name: /Video/ }));
    expect(
      screen.getByRole('dialog', { name: 'Add video' }),
    ).toBeInTheDocument();
    unmount();

    render(
      <ScriptrEditor
        bookmarkProvider={bookmarkProvider}
        mediaHost={mediaHost}
        value={document}
      />,
    );
    editor = screen.getByLabelText('Document editor');
    fireEvent.input(editor, { target: { textContent: '/' } });
    fireEvent.click(
      await screen.findByRole('option', { name: /Web bookmark/ }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Add web bookmark' }),
    ).toBeInTheDocument();
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    expect(screen.getByRole('textbox', { name: 'Bookmark URL' })).toHaveFocus();
  });

  it('persists a toggle disclosure state change', async () => {
    const onChange = vi.fn<(value: CanonicalDocument) => void>();
    render(
      <ScriptrEditor
        onChange={onChange}
        value={{
          version: 2,
          content: [
            {
              id: 'toggle',
              type: 'toggle',
              defaultOpen: true,
              summary: [{ type: 'text', text: 'More context' }],
              content: [
                {
                  id: 'inside',
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Inside' }],
                },
              ],
            },
          ],
        }}
      />,
    );

    const summary = await screen.findByText('More context');
    const details = summary.closest('details');
    if (!details) throw new Error('Expected toggle details element.');
    fireEvent.click(summary);

    await waitFor(() => {
      expect(details.open).toBe(false);
      const changes = onChange.mock.calls.map(([changed]) => changed);
      expect(
        changes.some(
          (changed) =>
            changed.content[0]?.type === 'toggle' &&
            changed.content[0].defaultOpen !== true,
        ),
      ).toBe(true);
    });

    fireEvent.keyDown(summary, { key: 'ArrowRight' });
    await waitFor(() => expect(details.open).toBe(true));
    expect(summary.isConnected).toBe(true);
    fireEvent.keyDown(summary, { key: 'ArrowLeft' });
    await waitFor(() => expect(details.open).toBe(false));
  });

  it('turns a selected block into a nested layout from its action menu', async () => {
    const { unmount } = render(<ScriptrEditor value={document} />);
    fireEvent.click(await screen.findByLabelText('Drag block to reorder'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Turn into' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Toggle' }));
    await waitFor(() =>
      expect(
        screen
          .getByLabelText('Document editor')
          .querySelector('[data-scriptr-toggle]'),
      ).not.toBeNull(),
    );
    unmount();

    render(<ScriptrEditor value={document} />);
    fireEvent.click(await screen.findByLabelText('Drag block to reorder'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Turn into' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Columns' }));
    await waitFor(() =>
      expect(
        screen
          .getByLabelText('Document editor')
          .querySelectorAll('[data-scriptr-column]'),
      ).toHaveLength(2),
    );
  });
});
