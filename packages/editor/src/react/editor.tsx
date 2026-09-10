import DragHandle from '@tiptap/extension-drag-handle-react';
import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { EditorView } from '@tiptap/pm/view';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { createCommandCatalogue } from '../commands/catalogue.js';
import type { CommandIcon, ScriptrCommand } from '../commands/catalogue.js';
import { defineScriptr } from '../config.js';
import type { ScriptrConfiguration } from '../config.js';
import { createDocumentCodec } from '../document/codec.js';
import type { CanonicalLocation } from '../document/locations.js';
import type {
  CanonicalDocument,
  ExtensionBlock,
  ImageBlock,
} from '../document/types.js';
import type {
  Reference,
  ScriptureBlock,
  TranslationComparisonBlock,
} from '../document/types.js';
import type { ScriptureProvider } from '../host/scripture.js';
import type { ImageHost } from '../host/images.js';
import { canonicalToEditorJson, editorJsonToCanonical } from './adapter.js';
import { createEditorExtensions } from './editor-extensions.js';
import type { ReactExtensionRenderer } from './renderer.js';

export type EditorChange = {
  readonly origin: 'user';
  readonly editorJson: unknown;
};

export type ScriptrEditorProps = {
  readonly value?: CanonicalDocument | undefined;
  readonly defaultValue?: CanonicalDocument | undefined;
  readonly onChange?:
    | ((document: CanonicalDocument, change: EditorChange) => void)
    | undefined;
  readonly editable?: boolean | undefined;
  readonly autofocus?: boolean | undefined;
  readonly placeholder?: string | undefined;
  readonly ariaLabel?: string | undefined;
  readonly className?: string | undefined;
  readonly scriptureProvider?: ScriptureProvider | undefined;
  readonly imageHost?: ImageHost | undefined;
  readonly extensions?: readonly ReactExtensionRenderer[] | undefined;
  readonly configuration?: ScriptrConfiguration | undefined;
  readonly onCommand?: ((command: ScriptrCommand) => void) | undefined;
};

export type ScriptrEditorHandle = {
  readonly focus: (position?: 'start' | 'end') => void;
  readonly blur: () => void;
  readonly selectAll: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly moveCurrentBlock: (direction: -1 | 1) => void;
  readonly insertScripture: (block: ScriptureBlock) => void;
  readonly insertTranslationComparison: (
    block: TranslationComparisonBlock,
  ) => void;
  readonly insertImage: (block: ImageBlock) => void;
  readonly insertExtension: (block: ExtensionBlock) => void;
  readonly navigateTo: (
    location: CanonicalLocation,
    options?: { readonly highlightMs?: number | undefined },
  ) => boolean;
  readonly addReference: (reference: Reference) => void;
  readonly updateReference: (reference: Reference) => void;
  readonly removeReference: (referenceId: string) => void;
  readonly setInternalDocumentLink: (targetId: string) => void;
  readonly removeInternalDocumentLink: () => void;
};

const emptyDocument: CanonicalDocument = {
  version: 2,
  content: [{ id: 'initial-paragraph', type: 'paragraph', content: [] }],
};
const noExtensions: readonly ReactExtensionRenderer[] = [];

type SlashItem = ScriptrCommand & {
  readonly run: (editor: Editor) => void;
};

const editorCommandIds = new Set([
  'text',
  'heading-1',
  'heading-2',
  'heading-3',
  'bullet-list',
  'ordered-list',
  'checklist',
  'quote',
  'code',
  'callout',
  'divider',
]);

const runEditorCommand = (id: string, editor: Editor): void => {
  const chain = editor.chain().focus();
  switch (id) {
    case 'text':
      void chain.setParagraph().run();
      return;
    case 'heading-1':
      void chain.toggleHeading({ level: 1 }).run();
      return;
    case 'heading-2':
      void chain.toggleHeading({ level: 2 }).run();
      return;
    case 'heading-3':
      void chain.toggleHeading({ level: 3 }).run();
      return;
    case 'bullet-list':
      void chain.toggleBulletList().run();
      return;
    case 'ordered-list':
      void chain.toggleOrderedList().run();
      return;
    case 'checklist':
      void chain.toggleTaskList().run();
      return;
    case 'quote':
      void chain.toggleBlockquote().run();
      return;
    case 'code':
      void chain.toggleCodeBlock().run();
      return;
    case 'callout':
      void chain
        .insertContent({ type: 'callout', attrs: { tone: 'note' } })
        .run();
      return;
    case 'divider':
      void chain.setHorizontalRule().run();
  }
};

function updateSlashQuery(editor: Editor): string | undefined {
  const { $from } = editor.state.selection;
  if (!$from.parent.isTextblock) return undefined;
  const text = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    '\ufffc',
  );
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(text);
  return match?.[1]?.toLowerCase();
}

function removeSlashQuery(editor: Editor) {
  const { $from } = editor.state.selection;
  const query = updateSlashQuery(editor);
  if (query === undefined) return;
  const from = $from.pos - query.length - 1;
  editor.chain().focus().deleteRange({ from, to: $from.pos }).run();
}

function moveCurrentBlockView(view: EditorView, direction: -1 | 1) {
  const { $from } = view.state.selection;
  const index = $from.index(0);
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= view.state.doc.childCount) return;

  let currentStart = 0;
  for (let childIndex = 0; childIndex < index; childIndex += 1) {
    currentStart += view.state.doc.child(childIndex).nodeSize;
  }
  const currentNode = view.state.doc.child(index);
  const transaction = view.state.tr.delete(
    currentStart,
    currentStart + currentNode.nodeSize,
  );

  if (direction === -1) {
    let previousStart = 0;
    for (let childIndex = 0; childIndex < targetIndex; childIndex += 1) {
      previousStart += view.state.doc.child(childIndex).nodeSize;
    }
    transaction.insert(previousStart, currentNode);
  } else {
    const nextNode = view.state.doc.child(targetIndex);
    transaction.insert(currentStart + nextNode.nodeSize, currentNode);
  }
  view.dispatch(transaction.scrollIntoView());
}

function moveCurrentBlock(editor: Editor, direction: -1 | 1) {
  moveCurrentBlockView(editor.view, direction);
}

function navigateToLocation(
  editor: Editor,
  location: CanonicalLocation,
  highlightMs = 1600,
) {
  let blockPosition: number | undefined;
  let selectionFrom: number | undefined;
  let selectionTo: number | undefined;
  editor.state.doc.descendants((node, position) => {
    if (blockPosition === undefined && node.attrs.id === location.blockId)
      blockPosition = position;
    if (blockPosition === undefined) return true;
    if (location.kind === 'reference' || location.kind === 'internalLink') {
      const mark = node.marks.find((candidate) =>
        location.kind === 'reference'
          ? candidate.type.name === 'referenceAnchor' &&
            candidate.attrs.referenceId === location.referenceId
          : candidate.type.name === 'internalDocumentLink' &&
            candidate.attrs.targetId === location.targetId,
      );
      if (mark) {
        selectionFrom = position;
        selectionTo = position + node.nodeSize;
        return false;
      }
    }
    return true;
  });
  if (blockPosition === undefined) return false;
  const foundBlockPosition = blockPosition;
  const block = editor.state.doc.nodeAt(foundBlockPosition);
  if (!block) return false;
  if (location.kind === 'text') {
    let remaining = location.offset ?? 0;
    block.descendants((node, relativePosition) => {
      if (!node.isText || selectionFrom !== undefined) return true;
      if (remaining > node.nodeSize) {
        remaining -= node.nodeSize;
        return true;
      }
      selectionFrom = foundBlockPosition + 1 + relativePosition + remaining;
      selectionTo = Math.min(
        selectionFrom + (location.length ?? 0),
        foundBlockPosition + block.nodeSize - 1,
      );
      return false;
    });
  }
  const transaction = editor.state.tr;
  transaction.setSelection(
    selectionFrom !== undefined && selectionTo !== undefined
      ? TextSelection.create(editor.state.doc, selectionFrom, selectionTo)
      : NodeSelection.create(editor.state.doc, foundBlockPosition),
  );
  editor.view.dispatch(transaction.scrollIntoView());
  const element = editor.view.nodeDOM(foundBlockPosition);
  if (element instanceof HTMLElement) {
    element.classList.add('scriptr-editor__temporary-highlight');
    globalThis.setTimeout(
      () => element.classList.remove('scriptr-editor__temporary-highlight'),
      Math.max(0, highlightMs),
    );
  }
  editor.commands.focus();
  return true;
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  onPress,
  children,
}: {
  readonly active?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly label: string;
  readonly onPress: () => void;
  readonly children: string;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active || undefined}
      className="scriptr-editor__tool"
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      type="button"
    >
      {children}
    </button>
  );
}

function CommandIconView({ icon }: { readonly icon: CommandIcon }) {
  return (
    <svg
      aria-hidden="true"
      className="scriptr-editor__command-icon"
      data-icon={icon}
      viewBox="0 0 20 20"
    >
      <rect x="3" y="3" width="14" height="14" rx="2" />
      {icon === 'columns' ? <path d="M10 3v14" /> : null}
      {icon === 'toggle' ? <path d="m8 6 5 4-5 4Z" /> : null}
      {icon === 'image' || icon === 'video' ? (
        <path d="m5 14 3-4 2 2 2-3 3 5M7 7h.01" />
      ) : null}
      {icon === 'audio' ? (
        <path d="M8 13V6l6-1v7M8 13c0 2-4 2-4 0s4-2 4 0Zm6-1c0 2-4 2-4 0s4-2 4 0Z" />
      ) : null}
      {icon === 'link' || icon === 'bookmark' ? (
        <path d="M8 12 12 8M7 6H5a3 3 0 0 0 0 6h2m6-6h2a3 3 0 0 1 0 6h-2" />
      ) : null}
      {icon === 'scripture' || icon === 'compare' ? (
        <path d="M6 5h8M6 8h8M6 11h5" />
      ) : null}
      {icon === 'reference' ? <path d="M7 6h6M7 10h6M7 14h4" /> : null}
      {[
        'text',
        'heading',
        'list',
        'checklist',
        'quote',
        'code',
        'callout',
        'divider',
        'extension',
      ].includes(icon) ? (
        <path d="M6 7h8M6 10h8M6 13h6" />
      ) : null}
    </svg>
  );
}

export const ScriptrEditor = forwardRef<
  ScriptrEditorHandle,
  ScriptrEditorProps
>(function ScriptrEditor(
  {
    value,
    defaultValue,
    onChange,
    editable = true,
    autofocus = false,
    placeholder = "Write, or type '/' for commands…",
    ariaLabel = 'Document editor',
    className,
    scriptureProvider,
    imageHost,
    extensions: extensionRenderers = noExtensions,
    configuration,
    onCommand,
  },
  forwardedRef,
) {
  const [initialDocument] = useState(
    () => value ?? defaultValue ?? emptyDocument,
  );
  const currentDocument = value ?? initialDocument;
  const documentRef = useRef(currentDocument);
  documentRef.current = currentDocument;
  const resolvedScriptureProvider =
    scriptureProvider ?? configuration?.capabilities.scripture;
  const resolvedImageHost = imageHost ?? configuration?.capabilities.images;
  const codec = useMemo(() => createDocumentCodec(), []);
  const editorExtensions = useMemo(
    () =>
      createEditorExtensions(
        placeholder,
        resolvedScriptureProvider,
        resolvedImageHost,
        extensionRenderers,
      ),
    [
      placeholder,
      resolvedScriptureProvider,
      resolvedImageHost,
      extensionRenderers,
    ],
  );
  const commandCatalogue = useMemo(() => {
    const features =
      configuration?.features ??
      defineScriptr({
        capabilities: {
          scripture: resolvedScriptureProvider,
          images: resolvedImageHost,
        },
      }).features;
    const extensionCommands = extensionRenderers.flatMap((extension) =>
      (extension.slashItems ?? []).map(
        (item): ScriptrCommand => ({
          id: `${extension.name}:${item.id}`,
          category: 'extension',
          label: item.label,
          notation: item.notation ?? 'EXT',
          icon: 'extension',
          keywords: item.keywords?.split(/\s+/).filter(Boolean) ?? [],
        }),
      ),
    );
    return createCommandCatalogue({ features, extensions: extensionCommands });
  }, [
    configuration,
    extensionRenderers,
    resolvedImageHost,
    resolvedScriptureProvider,
  ]);
  const availableSlashItems = useMemo(
    () =>
      commandCatalogue.all.map(
        (command): SlashItem => ({
          ...command,
          run: (currentEditor) => {
            const [extensionName, extensionItemId] = command.id.split(':');
            const extensionItem = extensionRenderers
              .find((extension) => extension.name === extensionName)
              ?.slashItems?.find((item) => item.id === extensionItemId);
            if (extensionItem) {
              const content = canonicalToEditorJson({
                version: 2,
                content: [extensionItem.createBlock()],
              }).content?.[0];
              if (content)
                void currentEditor.chain().focus().insertContent(content).run();
              return;
            }
            if (editorCommandIds.has(command.id))
              runEditorCommand(command.id, currentEditor);
            else onCommand?.(command);
          },
        }),
      ),
    [commandCatalogue, extensionRenderers, onCommand],
  );
  const [slashQuery, setSlashQuery] = useState<string>();
  const [slashIndex, setSlashIndex] = useState(0);
  const tiptapEditorRef = useRef<Editor | null>(null);
  const slashQueryRef = useRef<string | undefined>(undefined);
  const slashIndexRef = useRef(0);
  const setSlashState = (query: string | undefined, index = 0) => {
    slashQueryRef.current = query;
    slashIndexRef.current = index;
    setSlashQuery(query);
    setSlashIndex(index);
  };
  const serializedValue = value ? codec.serialize(value) : undefined;
  const editor = useEditor({
    extensions: editorExtensions,
    content: canonicalToEditorJson(initialDocument),
    editable,
    autofocus,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        class: 'scriptr-editor__content',
        dir: 'auto',
        spellcheck: 'true',
      },
      handleKeyDown(view, event) {
        const currentEditor = tiptapEditorRef.current;
        const currentQuery = slashQueryRef.current;
        if (currentEditor && currentQuery !== undefined) {
          const matchingIds = new Set(
            commandCatalogue.search(currentQuery).map((item) => item.id),
          );
          const matchingItems = availableSlashItems.filter((item) =>
            matchingIds.has(item.id),
          );
          if (event.key === 'Escape') {
            event.preventDefault();
            setSlashState(undefined);
            return true;
          }
          if (matchingItems.length && event.key === 'ArrowDown') {
            event.preventDefault();
            const next = (slashIndexRef.current + 1) % matchingItems.length;
            setSlashState(currentQuery, next);
            return true;
          }
          if (matchingItems.length && event.key === 'ArrowUp') {
            event.preventDefault();
            const next =
              (slashIndexRef.current - 1 + matchingItems.length) %
              matchingItems.length;
            setSlashState(currentQuery, next);
            return true;
          }
          if (matchingItems.length && event.key === 'Enter') {
            event.preventDefault();
            const item = matchingItems[slashIndexRef.current];
            if (item) {
              removeSlashQuery(currentEditor);
              item.run(currentEditor);
              setSlashState(undefined);
            }
            return true;
          }
        }
        if (event.altKey && event.shiftKey && event.key === 'ArrowUp') {
          event.preventDefault();
          moveCurrentBlockView(view, -1);
          return true;
        }
        if (event.altKey && event.shiftKey && event.key === 'ArrowDown') {
          event.preventDefault();
          moveCurrentBlockView(view, 1);
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor: updatedEditor }) {
      setSlashState(updateSlashQuery(updatedEditor));
      if (!onChange) return;
      const editorJson = updatedEditor.getJSON();
      onChange(
        editorJsonToCanonical(editorJson, documentRef.current.references),
        {
          origin: 'user',
          editorJson,
        },
      );
    },
    onSelectionUpdate({ editor: updatedEditor }) {
      setSlashState(updateSlashQuery(updatedEditor));
    },
  });
  tiptapEditorRef.current = editor;

  useImperativeHandle(
    forwardedRef,
    () => ({
      focus: (position = 'end') => void editor?.commands.focus(position),
      blur: () => void editor?.commands.blur(),
      selectAll: () => void editor?.commands.selectAll(),
      undo: () => void editor?.commands.undo(),
      redo: () => void editor?.commands.redo(),
      moveCurrentBlock: (direction) => {
        if (editor) moveCurrentBlock(editor, direction);
      },
      insertScripture: (block) => {
        const content = canonicalToEditorJson({ version: 2, content: [block] })
          .content?.[0];
        if (content) void editor?.chain().focus().insertContent(content).run();
      },
      insertTranslationComparison: (block) => {
        const content = canonicalToEditorJson({ version: 2, content: [block] })
          .content?.[0];
        if (content) void editor?.chain().focus().insertContent(content).run();
      },
      insertImage: (block) => {
        const content = canonicalToEditorJson({ version: 2, content: [block] })
          .content?.[0];
        if (content) void editor?.chain().focus().insertContent(content).run();
      },
      insertExtension: (block) => {
        const content = canonicalToEditorJson({ version: 2, content: [block] })
          .content?.[0];
        if (content) void editor?.chain().focus().insertContent(content).run();
      },
      navigateTo: (location, options) =>
        editor
          ? navigateToLocation(editor, location, options?.highlightMs)
          : false,
      addReference: (reference) => {
        if (!editor || editor.state.selection.empty) return;
        const nextReferences = {
          ...documentRef.current.references,
          [reference.id]: reference,
        };
        documentRef.current = {
          ...documentRef.current,
          references: nextReferences,
        };
        void editor
          .chain()
          .focus()
          .setMark('referenceAnchor', { referenceId: reference.id })
          .run();
      },
      updateReference: (reference) => {
        if (!editor || !documentRef.current.references?.[reference.id]) return;
        const references = {
          ...documentRef.current.references,
          [reference.id]: reference,
        };
        const nextDocument = editorJsonToCanonical(
          editor.getJSON(),
          references,
        );
        documentRef.current = nextDocument;
        onChange?.(nextDocument, {
          origin: 'user',
          editorJson: editor.getJSON(),
        });
      },
      removeReference: (referenceId) => {
        if (!editor) return;
        const references = Object.fromEntries(
          Object.entries(documentRef.current.references ?? {}).filter(
            ([id]) => id !== referenceId,
          ),
        );
        documentRef.current = {
          ...documentRef.current,
          references: Object.keys(references).length ? references : undefined,
        };
        const transaction = editor.state.tr;
        editor.state.doc.descendants((node, position) => {
          for (const mark of node.marks) {
            if (
              mark.type.name === 'referenceAnchor' &&
              mark.attrs.referenceId === referenceId
            ) {
              transaction.removeMark(position, position + node.nodeSize, mark);
            }
          }
        });
        editor.view.dispatch(transaction);
      },
      setInternalDocumentLink: (targetId) => {
        if (!editor || editor.state.selection.empty) return;
        void editor
          .chain()
          .focus()
          .setMark('internalDocumentLink', { targetId })
          .run();
      },
      removeInternalDocumentLink: () => {
        void editor?.chain().focus().unsetMark('internalDocumentLink').run();
      },
    }),
    [editor],
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor || !value || serializedValue === undefined) return;
    const current = editorJsonToCanonical(editor.getJSON(), value.references);
    if (codec.serialize(current) !== serializedValue) {
      editor.commands.setContent(canonicalToEditorJson(value), {
        emitUpdate: false,
      });
    }
  }, [codec, editor, serializedValue, value]);

  if (!editor)
    return (
      <div
        className="scriptr-editor scriptr-editor--loading"
        aria-busy="true"
      />
    );

  const filteredIds = new Set(
    commandCatalogue.search(slashQuery).map((item) => item.id),
  );
  const filteredSlashItems = availableSlashItems.filter((item) =>
    filteredIds.has(item.id),
  );
  const slashGroups = commandCatalogue.groups(slashQuery).map((group) => ({
    ...group,
    commands: filteredSlashItems.filter(
      (item) => item.category === group.category,
    ),
  }));

  return (
    <div
      className={['scriptr-editor', className].filter(Boolean).join(' ')}
      data-editable={editable || undefined}
    >
      {editable ? (
        <div className="scriptr-editor__history" aria-label="Editing history">
          <ToolbarButton
            label="Undo"
            disabled={!editor.can().undo()}
            onPress={() => void editor.chain().focus().undo().run()}
          >
            ↶
          </ToolbarButton>
          <ToolbarButton
            label="Redo"
            disabled={!editor.can().redo()}
            onPress={() => void editor.chain().focus().redo().run()}
          >
            ↷
          </ToolbarButton>
          <span className="scriptr-editor__history-divider" />
          <ToolbarButton
            label="Move block up"
            onPress={() => moveCurrentBlock(editor, -1)}
          >
            ↑
          </ToolbarButton>
          <ToolbarButton
            label="Move block down"
            onPress={() => moveCurrentBlock(editor, 1)}
          >
            ↓
          </ToolbarButton>
        </div>
      ) : null}

      {editable ? (
        <BubbleMenu
          editor={editor}
          className="scriptr-editor__bubble"
          options={{ placement: 'top' }}
        >
          <ToolbarButton
            label="Bold"
            active={editor.isActive('bold')}
            onPress={() => void editor.chain().focus().toggleBold().run()}
          >
            B
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor.isActive('italic')}
            onPress={() => void editor.chain().focus().toggleItalic().run()}
          >
            I
          </ToolbarButton>
          <ToolbarButton
            label="Underline"
            active={editor.isActive('underline')}
            onPress={() => void editor.chain().focus().toggleUnderline().run()}
          >
            U
          </ToolbarButton>
          <ToolbarButton
            label="Strikethrough"
            active={editor.isActive('strike')}
            onPress={() => void editor.chain().focus().toggleStrike().run()}
          >
            S
          </ToolbarButton>
          <ToolbarButton
            label="Inline code"
            active={editor.isActive('code')}
            onPress={() => void editor.chain().focus().toggleCode().run()}
          >
            &lt;/&gt;
          </ToolbarButton>
          <ToolbarButton
            label="Link"
            active={editor.isActive('link')}
            onPress={() => {
              if (editor.isActive('link')) {
                editor.chain().focus().unsetLink().run();
                return;
              }
              const href = window.prompt('Link URL');
              if (href) editor.chain().focus().setLink({ href }).run();
            }}
          >
            ↗
          </ToolbarButton>
        </BubbleMenu>
      ) : null}

      {editable ? (
        <DragHandle
          editor={editor}
          nested
          className="scriptr-editor__drag-handle"
        >
          <button aria-label="Drag block to reorder" type="button">
            ⋮⋮
          </button>
        </DragHandle>
      ) : null}

      <EditorContent editor={editor} />

      {editable && slashQuery !== undefined ? (
        <div
          className="scriptr-editor__slash"
          role="menu"
          aria-label="Insert block"
        >
          {filteredSlashItems.length ? (
            slashGroups.map((group) => (
              <div
                className="scriptr-editor__command-group"
                key={group.category}
              >
                <p className="scriptr-editor__menu-label">{group.label}</p>
                {group.commands.map((item) => {
                  const index = filteredSlashItems.findIndex(
                    (candidate) => candidate.id === item.id,
                  );
                  return (
                    <button
                      className="scriptr-editor__slash-item"
                      data-selected={index === slashIndex || undefined}
                      key={item.id}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        removeSlashQuery(editor);
                        item.run(editor);
                        setSlashState(undefined);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <CommandIconView icon={item.icon} />
                      <span>{item.label}</span>
                      <small>{item.notation}</small>
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="scriptr-editor__empty-menu">No matching blocks</p>
          )}
        </div>
      ) : null}
    </div>
  );
});
