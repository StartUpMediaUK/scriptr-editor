import DragHandle from '@tiptap/extension-drag-handle-react';
import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { EditorView } from '@tiptap/pm/view';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  Blocks,
  BookOpenText,
  Bookmark,
  CheckSquare,
  Code2,
  Columns2,
  Heading,
  GripVertical,
  Image,
  Link2,
  List,
  ListCollapse,
  MessageSquareText,
  Minus,
  NotebookPen,
  Quote,
  Redo2,
  Rows3,
  Trash2,
  Type,
  Undo2,
  Video,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { createCommandCatalogue } from '../commands/catalogue.js';
import { Button } from '../components/ui/button.js';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '../components/ui/command.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '../components/ui/popover.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip.js';
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
import type { DocumentTargetProvider } from '../host/documents.js';
import { canonicalToEditorJson, editorJsonToCanonical } from './adapter.js';
import { DocumentLinkPicker } from './document-link-picker.js';
import { createEditorExtensions } from './editor-extensions.js';
import { ReferenceEditor } from './reference-editor.js';
import type { ReactExtensionRenderer } from './renderer.js';
import { ScriptureCommandDialog } from './scripture-command-dialog.js';
import {
  ColorPicker,
  ColorPickerHue,
  ColorPickerSelection,
} from '../components/kibo-ui/color-picker/index.js';

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
  readonly documentTargetProvider?: DocumentTargetProvider | undefined;
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

type CommandWorkflow =
  | { readonly type: 'scripture' | 'comparison' | 'internal-link' }
  | {
      readonly type: 'link';
      readonly label: string;
      readonly url: string;
      readonly range: { readonly from: number; readonly to: number };
    }
  | {
      readonly type: 'reference';
      readonly reference: Reference;
      readonly range: { readonly from: number; readonly to: number };
    };

let generatedId = 0;
const createAuthoredId = (prefix: string) => {
  generatedId += 1;
  return `${prefix}-${Date.now().toString(36)}-${generatedId.toString(36)}`;
};

const normalizeExternalUrl = (value: string) => {
  const candidate = value.trim();
  if (!candidate || /\s/.test(candidate)) return undefined;
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(candidate)
    ? candidate
    : `https://${candidate}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      return parsed.hostname === 'localhost' || parsed.hostname.includes('.')
        ? parsed.href
        : undefined;
    if (parsed.protocol === 'mailto:')
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parsed.pathname)
        ? parsed.href
        : undefined;
    if (parsed.protocol === 'tel:')
      return /^\+?[\d(). -]{5,}$/.test(parsed.pathname)
        ? parsed.href
        : undefined;
    return undefined;
  } catch {
    return undefined;
  }
};

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
  readonly children: ReactNode;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={label}
              aria-pressed={active || undefined}
              className="scriptr-editor__tool"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onPress}
              size="icon-sm"
              type="button"
              variant="ghost"
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CommandIconView({ icon }: { readonly icon: CommandIcon }) {
  let Icon: LucideIcon;
  switch (icon) {
    case 'text':
      Icon = Type;
      break;
    case 'heading':
      Icon = Heading;
      break;
    case 'list':
      Icon = List;
      break;
    case 'checklist':
      Icon = CheckSquare;
      break;
    case 'quote':
      Icon = Quote;
      break;
    case 'code':
      Icon = Code2;
      break;
    case 'callout':
      Icon = MessageSquareText;
      break;
    case 'divider':
      Icon = Minus;
      break;
    case 'scripture':
      Icon = BookOpenText;
      break;
    case 'compare':
      Icon = Rows3;
      break;
    case 'reference':
      Icon = NotebookPen;
      break;
    case 'link':
      Icon = Link2;
      break;
    case 'columns':
      Icon = Columns2;
      break;
    case 'toggle':
      Icon = ListCollapse;
      break;
    case 'image':
      Icon = Image;
      break;
    case 'video':
      Icon = Video;
      break;
    case 'audio':
      Icon = AudioLines;
      break;
    case 'bookmark':
      Icon = Bookmark;
      break;
    case 'extension':
      Icon = Blocks;
  }
  return (
    <Icon
      aria-hidden="true"
      className="scriptr-editor__command-icon"
      data-command-icon={icon}
    />
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
    documentTargetProvider,
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
  const resolvedDocumentTargetProvider =
    documentTargetProvider ?? configuration?.capabilities.documents;
  const [commandWorkflow, setCommandWorkflow] = useState<CommandWorkflow>();
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
          documents: resolvedDocumentTargetProvider,
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
            else if (command.id === 'scripture' || command.id === 'comparison')
              setCommandWorkflow({ type: command.id });
            else if (command.id === 'reference')
              setCommandWorkflow({
                type: 'reference',
                range: {
                  from: currentEditor.state.selection.from,
                  to: currentEditor.state.selection.to,
                },
                reference: {
                  id: createAuthoredId('reference'),
                  content: [{ type: 'paragraph', content: [] }],
                },
              });
            else if (command.id === 'link') {
              const { from, to } = currentEditor.state.selection;
              setCommandWorkflow({
                type: 'link',
                label: currentEditor.state.doc.textBetween(from, to),
                url: '',
                range: { from, to },
              });
            } else if (command.id === 'internal-link')
              setCommandWorkflow({ type: 'internal-link' });
            else onCommand?.(command);
          },
        }),
      ),
    [commandCatalogue, extensionRenderers, onCommand],
  );
  const [slashQuery, setSlashQuery] = useState<string>();
  const [slashIndex, setSlashIndex] = useState(0);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [customColourOpen, setCustomColourOpen] = useState(false);
  const activeBlockPositionRef = useRef(-1);
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
        if (
          currentEditor?.state.selection.empty &&
          currentEditor.isActive('link') &&
          (event.key === 'Enter' || /^[.,!?;:]$/.test(event.key))
        )
          currentEditor.commands.unsetLink();
        if (
          currentEditor?.state.selection.empty &&
          currentEditor.isActive('link') &&
          event.key === ' ' &&
          currentEditor.state.doc.textBetween(
            Math.max(0, currentEditor.state.selection.from - 1),
            currentEditor.state.selection.from,
          ) === ' '
        )
          currentEditor.commands.unsetLink();
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

  useEffect(() => {
    if (!blockMenuOpen) return;

    const closeOnScroll = () => setBlockMenuOpen(false);

    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [blockMenuOpen]);

  useEffect(() => {
    if (!editor || !editable) return;
    const revealHandleFromGutter = (event: MouseEvent) => {
      const content = editor.view.dom;
      const bounds = content.getBoundingClientRect();
      const gutterWidth = 48;
      if (
        event.clientX < bounds.left - gutterWidth ||
        event.clientX >= bounds.left ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        return;

      const blockAtPointer = document.elementFromPoint(
        bounds.left + 1,
        event.clientY,
      );
      if (!blockAtPointer || !content.contains(blockAtPointer)) return;
      blockAtPointer.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientX: bounds.left + 1,
          clientY: event.clientY,
        }),
      );
    };

    document.addEventListener('mousemove', revealHandleFromGutter, true);
    return () =>
      document.removeEventListener('mousemove', revealHandleFromGutter, true);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor || !editable) return;
    const editLink = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!anchor || !editor.view.dom.contains(anchor)) return;
      event.preventDefault();
      const from = editor.view.posAtDOM(anchor, 0);
      setCommandWorkflow({
        type: 'link',
        label: anchor.textContent ?? '',
        url: anchor.getAttribute('href') ?? '',
        range: { from, to: from + (anchor.textContent?.length ?? 0) },
      });
    };
    editor.view.dom.addEventListener('click', editLink);
    return () => editor.view.dom.removeEventListener('click', editLink);
  }, [editable, editor]);
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
  const normalizedLinkUrl =
    commandWorkflow?.type === 'link'
      ? normalizeExternalUrl(commandWorkflow.url)
      : undefined;

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
            <Undo2 />
          </ToolbarButton>
          <ToolbarButton
            label="Redo"
            disabled={!editor.can().redo()}
            onPress={() => void editor.chain().focus().redo().run()}
          >
            <Redo2 />
          </ToolbarButton>
          <span className="scriptr-editor__history-divider" />
          <ToolbarButton
            label="Move block up"
            onPress={() => moveCurrentBlock(editor, -1)}
          >
            <ArrowUp />
          </ToolbarButton>
          <ToolbarButton
            label="Move block down"
            onPress={() => moveCurrentBlock(editor, 1)}
          >
            <ArrowDown />
          </ToolbarButton>
        </div>
      ) : null}

      {editable ? (
        <BubbleMenu
          editor={editor}
          className="scriptr-editor__bubble"
          options={{ placement: 'top' }}
        >
          <Popover>
            <PopoverTrigger
              render={
                <Button size="sm" type="button" variant="ghost">
                  Normal text
                </Button>
              }
            />
            <PopoverContent className="scriptr-editor__bubble-panel">
              <PopoverTitle className="sr-only">Turn text into</PopoverTitle>
              <Button
                onClick={() => void editor.chain().focus().setParagraph().run()}
                size="sm"
                type="button"
                variant="ghost"
              >
                Normal text
              </Button>
              <Button
                onClick={() =>
                  void editor.chain().focus().toggleHeading({ level: 1 }).run()
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                Heading 1
              </Button>
              <Button
                onClick={() =>
                  void editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                Heading 2
              </Button>
              <Button
                onClick={() =>
                  void editor.chain().focus().toggleBlockquote().run()
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                Quote
              </Button>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  aria-label="Text and highlight colour"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  A
                </Button>
              }
            />
            <PopoverContent className="scriptr-editor__colour-panel">
              <PopoverTitle className="sr-only">
                Text and highlight colour
              </PopoverTitle>
              <p>Text colour</p>
              <div className="scriptr-editor__swatches">
                {[
                  '#24211d',
                  '#6f6a63',
                  '#9b5e3c',
                  '#b56b24',
                  '#a98520',
                  '#398363',
                  '#3978b9',
                  '#8056aa',
                  '#b84e7a',
                  '#b74d43',
                ].map((colour) => (
                  <Button
                    aria-label={`Set text colour ${colour}`}
                    key={colour}
                    onClick={() =>
                      void editor
                        .chain()
                        .focus()
                        .setMark('textColour', { colour })
                        .run()
                    }
                    style={{ color: colour }}
                    type="button"
                  >
                    A
                  </Button>
                ))}
              </div>
              <p>Highlight colour</p>
              <div className="scriptr-editor__swatches">
                <Button
                  aria-label="Remove highlight colour"
                  onClick={() =>
                    void editor
                      .chain()
                      .focus()
                      .unsetMark('highlightColour')
                      .run()
                  }
                  type="button"
                >
                  ∅
                </Button>
                {[
                  '#f4eee3',
                  '#eee9df',
                  '#f3e3dc',
                  '#f7e0cc',
                  '#f7edc9',
                  '#dcece5',
                  '#d9eafb',
                  '#e8def4',
                  '#f2dce7',
                  '#f4dcda',
                ].map((colour) => (
                  <Button
                    aria-label={`Set highlight colour ${colour}`}
                    key={colour}
                    onClick={() =>
                      void editor
                        .chain()
                        .focus()
                        .setMark('highlightColour', { colour })
                        .run()
                    }
                    style={{ backgroundColor: colour }}
                    type="button"
                  />
                ))}
              </div>
              <Popover
                onOpenChange={setCustomColourOpen}
                open={customColourOpen}
              >
                <PopoverTrigger
                  render={
                    <Button size="sm" type="button" variant="ghost">
                      Custom colour
                    </Button>
                  }
                />
                {customColourOpen ? (
                  <PopoverContent>
                    <PopoverTitle className="sr-only">
                      Custom text colour
                    </PopoverTitle>
                    <ColorPicker
                      onChange={(value) => {
                        if (Array.isArray(value))
                          void editor
                            .chain()
                            .focus()
                            .setMark('textColour', {
                              colour: `rgba(${value.join(',')})`,
                            })
                            .run();
                      }}
                    >
                      <ColorPickerSelection className="h-28" />
                      <ColorPickerHue />
                    </ColorPicker>
                  </PopoverContent>
                ) : null}
              </Popover>
            </PopoverContent>
          </Popover>
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
              const { from, to } = editor.state.selection;
              if (editor.isActive('link')) {
                setCommandWorkflow({
                  type: 'link',
                  label: editor.state.doc.textBetween(from, to),
                  url: String(editor.getAttributes('link').href ?? ''),
                  range: { from, to },
                });
                return;
              }
              setCommandWorkflow({
                type: 'link',
                label: editor.state.doc.textBetween(from, to),
                url: '',
                range: { from, to },
              });
            }}
          >
            <Link2
              aria-hidden="true"
              className="scriptr-editor__command-icon"
              data-icon="inline-start"
            />
          </ToolbarButton>
        </BubbleMenu>
      ) : null}

      {editable ? (
        <BubbleMenu
          editor={editor}
          className="scriptr-editor__reference-end"
          options={{ placement: 'top' }}
          shouldShow={({ state }) =>
            state.selection.empty && editor.isActive('referenceAnchor')
          }
        >
          <Button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              void editor.chain().focus().unsetMark('referenceAnchor').run()
            }
            size="inline"
            type="button"
            variant="muted-link"
          >
            End reference here
          </Button>
        </BubbleMenu>
      ) : null}

      {editable ? (
        <BubbleMenu
          editor={editor}
          className="scriptr-editor__reference-end"
          options={{ placement: 'top' }}
          shouldShow={({ state }) =>
            state.selection.empty && editor.isActive('link')
          }
        >
          <Button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void editor.chain().focus().unsetLink().run()}
            size="inline"
            type="button"
            variant="muted-link"
          >
            End link here
          </Button>
        </BubbleMenu>
      ) : null}

      {editable ? (
        <DragHandle
          editor={editor}
          className="scriptr-editor__drag-handle"
          onNodeChange={({ pos }) => {
            activeBlockPositionRef.current = pos;
          }}
        >
          <Popover onOpenChange={setBlockMenuOpen} open={blockMenuOpen}>
            <PopoverTrigger
              render={
                <Button
                  aria-label="Drag block to reorder"
                  onClick={() => {
                    if (!blockMenuOpen && activeBlockPositionRef.current >= 0)
                      editor.commands.setNodeSelection(
                        activeBlockPositionRef.current,
                      );
                  }}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                />
              }
            >
              <GripVertical />
            </PopoverTrigger>
            {blockMenuOpen ? (
              <PopoverContent
                align="start"
                className="scriptr-editor__block-menu"
                role="menu"
                side="right"
              >
                <PopoverTitle className="sr-only">Block actions</PopoverTitle>
                <p>Block</p>
                <Button
                  onClick={() => {
                    void editor.chain().focus().setParagraph().run();
                    setBlockMenuOpen(false);
                  }}
                  role="menuitem"
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Turn into text
                </Button>
                <Button
                  onClick={() => {
                    void editor
                      .chain()
                      .focus()
                      .toggleHeading({ level: 1 })
                      .run();
                    setBlockMenuOpen(false);
                  }}
                  role="menuitem"
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Turn into heading 1
                </Button>
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button size="sm" type="button" variant="ghost">
                        Colour
                      </Button>
                    }
                  />
                  <PopoverContent className="scriptr-editor__colour-panel">
                    <PopoverTitle className="sr-only">
                      Block colour
                    </PopoverTitle>
                    <p>Text colour</p>
                    <div className="scriptr-editor__swatches">
                      <Button
                        aria-label="Remove block text colour"
                        onClick={() =>
                          void editor
                            .chain()
                            .focus()
                            .unsetMark('textColour')
                            .run()
                        }
                        type="button"
                      >
                        A
                      </Button>
                      {[
                        '#6f6a63',
                        '#9b5e3c',
                        '#b56b24',
                        '#a98520',
                        '#398363',
                        '#3978b9',
                        '#8056aa',
                        '#b84e7a',
                        '#b74d43',
                      ].map((colour) => (
                        <Button
                          aria-label={`Set block text colour ${colour}`}
                          key={colour}
                          onClick={() =>
                            void editor
                              .chain()
                              .focus()
                              .setMark('textColour', { colour })
                              .run()
                          }
                          style={{ color: colour }}
                          type="button"
                        >
                          A
                        </Button>
                      ))}
                    </div>
                    <p>Highlight colour</p>
                    <div className="scriptr-editor__swatches">
                      <Button
                        aria-label="Remove block highlight colour"
                        onClick={() =>
                          void editor
                            .chain()
                            .focus()
                            .unsetMark('highlightColour')
                            .run()
                        }
                        type="button"
                      >
                        ⊘
                      </Button>
                      {[
                        '#ece9e4',
                        '#f1e6df',
                        '#f5e2cf',
                        '#f4ebcc',
                        '#dfece5',
                        '#dceaf5',
                        '#e8e0f2',
                        '#f2dfe7',
                        '#f3dfdc',
                      ].map((colour) => (
                        <Button
                          aria-label={`Set block highlight colour ${colour}`}
                          key={colour}
                          onClick={() =>
                            void editor
                              .chain()
                              .focus()
                              .setMark('highlightColour', { colour })
                              .run()
                          }
                          style={{ backgroundColor: colour }}
                          type="button"
                        />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  onClick={() => {
                    editor.commands.deleteNode(
                      editor.state.selection.$from.parent.type.name,
                    );
                    setBlockMenuOpen(false);
                  }}
                  role="menuitem"
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              </PopoverContent>
            ) : null}
          </Popover>
        </DragHandle>
      ) : null}

      <EditorContent editor={editor} />

      {editable && slashQuery !== undefined ? (
        <Command
          aria-label="Insert block"
          className="scriptr-editor__slash"
          role="menu"
          shouldFilter={false}
          {...(filteredSlashItems[slashIndex]
            ? { value: filteredSlashItems[slashIndex].id }
            : {})}
        >
          <CommandList>
            {slashGroups.map((group) => (
              <CommandGroup
                className="scriptr-editor__command-group"
                heading={group.label}
                key={group.category}
              >
                {group.commands.map((item) => {
                  const index = filteredSlashItems.findIndex(
                    (candidate) => candidate.id === item.id,
                  );
                  return (
                    <CommandItem
                      className="scriptr-editor__slash-item"
                      data-selected={index === slashIndex || undefined}
                      key={item.id}
                      onMouseDown={(event) => event.preventDefault()}
                      onSelect={() => {
                        removeSlashQuery(editor);
                        item.run(editor);
                        setSlashState(undefined);
                      }}
                      value={item.id}
                    >
                      <CommandIconView icon={item.icon} />
                      <span>{item.label}</span>
                      <small>{item.notation}</small>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
            <CommandEmpty className="scriptr-editor__empty-menu">
              No matching blocks
            </CommandEmpty>
          </CommandList>
        </Command>
      ) : null}

      {commandWorkflow?.type === 'scripture' ||
      commandWorkflow?.type === 'comparison' ? (
        resolvedScriptureProvider ? (
          <ScriptureCommandDialog
            mode={commandWorkflow.type}
            onCancel={() => setCommandWorkflow(undefined)}
            onSelect={(address, translationIds) => {
              const block =
                commandWorkflow.type === 'scripture'
                  ? {
                      id: createAuthoredId('scripture'),
                      type: 'scripture' as const,
                      address,
                      translationId: translationIds[0] ?? '',
                    }
                  : {
                      id: createAuthoredId('comparison'),
                      type: 'translationComparison' as const,
                      address,
                      translationIds,
                      layout: 'twoColumn' as const,
                    };
              const content = canonicalToEditorJson({
                version: 2,
                content: [block],
              }).content?.[0];
              if (content)
                void editor.chain().focus().insertContent(content).run();
              setCommandWorkflow(undefined);
            }}
            provider={resolvedScriptureProvider}
          />
        ) : null
      ) : null}

      {commandWorkflow?.type === 'reference' ? (
        <Dialog
          onOpenChange={(open) => {
            if (!open) setCommandWorkflow(undefined);
          }}
          open
        >
          <DialogContent aria-label="Add Reference">
            <DialogHeader>
              <DialogTitle>Add Reference</DialogTitle>
              <DialogClose
                aria-label="Close Reference editor"
                render={<Button size="icon-sm" variant="ghost" />}
              >
                <X />
              </DialogClose>
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const { reference, range } = commandWorkflow;
                if (!reference.title?.trim()) return;
                documentRef.current = {
                  ...documentRef.current,
                  references: {
                    ...documentRef.current.references,
                    [reference.id]: reference,
                  },
                };
                const chain = editor
                  .chain()
                  .focus()
                  .setTextSelection(range)
                  .setMark('referenceAnchor', {
                    referenceId: reference.id,
                  });
                void chain.run();
                setCommandWorkflow(undefined);
              }}
            >
              <label className="scriptr-editor__workflow-field">
                <span className="sr-only">Reference name</span>
                <Input
                  aria-label="Reference name"
                  autoFocus
                  onChange={(event) =>
                    setCommandWorkflow({
                      ...commandWorkflow,
                      reference: {
                        ...commandWorkflow.reference,
                        title: event.currentTarget.value,
                      },
                    })
                  }
                  placeholder="Source, article, or note title"
                  value={commandWorkflow.reference.title ?? ''}
                />
              </label>
              <label className="scriptr-editor__workflow-field">
                <span className="sr-only">Description</span>
                <ReferenceEditor
                  onChange={(reference) =>
                    setCommandWorkflow({ ...commandWorkflow, reference })
                  }
                  reference={commandWorkflow.reference}
                />
              </label>
              <DialogFooter>
                <Button
                  onClick={() => setCommandWorkflow(undefined)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  disabled={!commandWorkflow.reference.title?.trim()}
                  size="sm"
                  type="submit"
                >
                  Add Reference
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {commandWorkflow?.type === 'internal-link' &&
      resolvedDocumentTargetProvider ? (
        <Dialog
          onOpenChange={(open) => {
            if (!open) setCommandWorkflow(undefined);
          }}
          open
        >
          <DialogContent aria-label="Link to document">
            <DialogTitle className="sr-only">Link to document</DialogTitle>
            <DocumentLinkPicker
              onCancel={() => setCommandWorkflow(undefined)}
              onSelect={(target) => {
                if (!editor.state.selection.empty)
                  void editor
                    .chain()
                    .focus()
                    .setMark('internalDocumentLink', { targetId: target.id })
                    .run();
                setCommandWorkflow(undefined);
              }}
              provider={resolvedDocumentTargetProvider}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {commandWorkflow?.type === 'link' ? (
        <Dialog
          onOpenChange={(open) => {
            if (!open) setCommandWorkflow(undefined);
          }}
          open
        >
          <DialogContent aria-label="Add or edit link">
            <DialogHeader>
              <DialogTitle>Link</DialogTitle>
              <DialogClose
                aria-label="Close link editor"
                render={<Button size="icon-sm" variant="ghost" />}
              >
                <X />
              </DialogClose>
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!normalizedLinkUrl) return;
                const { from, to } = commandWorkflow.range;
                const label = commandWorkflow.label.trim();
                const chain = editor
                  .chain()
                  .focus()
                  .setTextSelection({ from, to });
                if (label) {
                  chain.insertContent({
                    type: 'text',
                    text: label,
                    marks: [
                      {
                        type: 'link',
                        attrs: { href: normalizedLinkUrl },
                      },
                    ],
                  });
                } else if (from !== to) {
                  chain.setLink({ href: normalizedLinkUrl });
                } else {
                  chain.setLink({ href: normalizedLinkUrl });
                }
                void chain.run();
                setCommandWorkflow(undefined);
              }}
            >
              <label className="scriptr-editor__workflow-field">
                <span className="sr-only">Link label</span>
                <Input
                  aria-label="Link label"
                  autoFocus
                  onChange={(event) =>
                    setCommandWorkflow({
                      ...commandWorkflow,
                      label: event.currentTarget.value,
                    })
                  }
                  placeholder="Link label"
                  value={commandWorkflow.label}
                />
              </label>
              <label className="scriptr-editor__workflow-field">
                <span className="sr-only">Link URL</span>
                <Input
                  aria-label="Link URL"
                  aria-invalid={
                    commandWorkflow.url && !normalizedLinkUrl ? true : undefined
                  }
                  inputMode="url"
                  onChange={(event) =>
                    setCommandWorkflow({
                      ...commandWorkflow,
                      url: event.currentTarget.value,
                    })
                  }
                  placeholder="example.com"
                  value={commandWorkflow.url}
                />
              </label>
              <DialogFooter>
                <Button
                  onClick={() => {
                    const { from, to } = commandWorkflow.range;
                    void editor
                      .chain()
                      .focus()
                      .setTextSelection({ from, to })
                      .unsetLink()
                      .run();
                    setCommandWorkflow(undefined);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Remove link
                </Button>
                <Button disabled={!normalizedLinkUrl} size="sm" type="submit">
                  Add link
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
});
