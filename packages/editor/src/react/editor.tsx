import DragHandle from '@tiptap/extension-drag-handle-react';
import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { EditorView } from '@tiptap/pm/view';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  Blocks,
  BookOpenText,
  Bookmark,
  CaseSensitive,
  CheckSquare,
  Code2,
  Columns2,
  Copy,
  Heading,
  GripVertical,
  Image,
  Link2,
  List,
  ListCollapse,
  MessageSquareText,
  Minus,
  NotebookPen,
  PaintRoller,
  Plus,
  Quote,
  Redo2,
  Repeat2,
  Rows3,
  Trash2,
  Type,
  Undo2,
  Video,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js';
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
  CommandInput,
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
  AudioBlock,
  CanonicalDocument,
  ExtensionBlock,
  ImageBlock,
  VideoBlock,
  WebBookmarkBlock,
} from '../document/types.js';
import type {
  Reference,
  ScriptureBlock,
  TranslationComparisonBlock,
} from '../document/types.js';
import type { ScriptureProvider } from '../host/scripture.js';
import type { ImageHost } from '../host/images.js';
import type { MediaHost } from '../host/media.js';
import type { BookmarkProvider } from '../host/bookmarks.js';
import type { DocumentTargetProvider } from '../host/documents.js';
import { canonicalToEditorJson, editorJsonToCanonical } from './adapter.js';
import { BookmarkComposer } from './bookmark-block.js';
import { DocumentLinkPicker } from './document-link-picker.js';
import { createEditorExtensions } from './editor-extensions.js';
import { ImageUploader } from './image-block.js';
import { MediaUploader } from './media-block.js';
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
  readonly mediaHost?: MediaHost | undefined;
  readonly bookmarkProvider?: BookmarkProvider | undefined;
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
  readonly insertVideo: (block: VideoBlock) => void;
  readonly insertAudio: (block: AudioBlock) => void;
  readonly insertBookmark: (block: WebBookmarkBlock) => void;
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
  | { readonly type: 'image' | 'video' | 'audio' | 'bookmark' }
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
  'accent',
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
  'columns',
  'toggle',
  'toggle-heading-1',
  'toggle-heading-2',
  'toggle-heading-3',
]);

const runEditorCommand = (id: string, editor: Editor): void => {
  const chain = editor.chain().focus();
  switch (id) {
    case 'text':
      void chain.setParagraph().run();
      return;
    case 'accent':
      void chain.toggleMark('accent').run();
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
      return;
    case 'columns':
      void chain
        .insertContent({
          type: 'columns',
          content: [
            { type: 'column', content: [{ type: 'paragraph' }] },
            { type: 'column', content: [{ type: 'paragraph' }] },
          ],
        })
        .run();
      return;
    case 'toggle':
    case 'toggle-heading-1':
    case 'toggle-heading-2':
    case 'toggle-heading-3': {
      const headingLevel =
        id === 'toggle-heading-1'
          ? 1
          : id === 'toggle-heading-2'
            ? 2
            : id === 'toggle-heading-3'
              ? 3
              : null;
      void chain
        .insertContent({
          type: 'toggle',
          attrs: { headingLevel, defaultOpen: true },
          content: [
            { type: 'toggleSummary' },
            {
              type: 'toggleContent',
              content: [{ type: 'paragraph' }],
            },
          ],
        })
        .run();
      return;
    }
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

function replaceSelectedBlockWithColumns(editor: Editor) {
  const { selection, schema } = editor.state;
  if (!(selection instanceof NodeSelection)) return false;
  const columnsType = schema.nodes.columns;
  const columnType = schema.nodes.column;
  const paragraphType = schema.nodes.paragraph;
  if (!columnsType || !columnType || !paragraphType) return false;
  const emptyParagraph = paragraphType.createAndFill();
  if (!emptyParagraph) return false;
  const columns = columnsType.create(null, [
    columnType.create(null, selection.node),
    columnType.create(null, emptyParagraph),
  ]);
  const transaction = editor.state.tr.replaceSelectionWith(columns);
  transaction.setSelection(
    TextSelection.near(transaction.doc.resolve(selection.from + 2)),
  );
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

function selectBlockForAction(editor: Editor, preferredPosition: number) {
  if (editor.state.selection instanceof NodeSelection) return true;
  const fallbackPosition =
    editor.state.selection.$from.depth > 0
      ? editor.state.selection.$from.before(1)
      : 0;
  const position =
    preferredPosition >= 0 ? preferredPosition : fallbackPosition;
  const node = editor.state.doc.nodeAt(position);
  if (!node?.isBlock) return false;
  editor.commands.setNodeSelection(position);
  return editor.state.selection instanceof NodeSelection;
}

function selectBlockText(editor: Editor, preferredPosition: number) {
  if (!selectBlockForAction(editor, preferredPosition)) return false;
  const selection = editor.state.selection;
  if (!(selection instanceof NodeSelection) || !selection.node.isTextblock)
    return false;
  editor.commands.setTextSelection({
    from: selection.from + 1,
    to: selection.from + selection.node.nodeSize - 1,
  });
  return true;
}

function setBlockBackground(
  editor: Editor,
  preferredPosition: number,
  background: string | null,
) {
  if (!selectBlockForAction(editor, preferredPosition)) return false;
  const selection = editor.state.selection;
  if (!(selection instanceof NodeSelection)) return false;
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(selection.from, undefined, {
      ...selection.node.attrs,
      background,
    }),
  );
  return true;
}

function replaceSelectedBlockWithToggle(editor: Editor) {
  const { selection, schema } = editor.state;
  if (!(selection instanceof NodeSelection)) return false;
  const toggleType = schema.nodes.toggle;
  const summaryType = schema.nodes.toggleSummary;
  const contentType = schema.nodes.toggleContent;
  const paragraphType = schema.nodes.paragraph;
  if (!toggleType || !summaryType || !contentType || !paragraphType)
    return false;

  const textBlock = selection.node.isTextblock;
  const summary = summaryType.create(
    null,
    textBlock ? selection.node.content : undefined,
  );
  const emptyParagraph = paragraphType.createAndFill();
  if (!emptyParagraph) return false;
  const body = contentType.create(
    null,
    textBlock ? emptyParagraph : selection.node,
  );
  const level: unknown =
    selection.node.type.name === 'heading' ? selection.node.attrs.level : null;
  const toggle = toggleType.create(
    {
      defaultOpen: true,
      headingLevel: level === 1 || level === 2 || level === 3 ? level : null,
    },
    [summary, body],
  );
  const transaction = editor.state.tr.replaceSelectionWith(toggle);
  transaction.setSelection(
    TextSelection.near(transaction.doc.resolve(selection.from + 2)),
  );
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

function moveCurrentBlock(editor: Editor, direction: -1 | 1) {
  moveCurrentBlockView(editor.view, direction);
}

function cloneAuthoredNode(node: ProseMirrorNode): ProseMirrorNode {
  if (node.isText) return node.type.schema.text(node.text ?? '', node.marks);
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => children.push(cloneAuthoredNode(child)));
  const id: unknown = node.attrs.id;
  const attrs =
    typeof id === 'string'
      ? { ...node.attrs, id: createAuthoredId(node.type.name) }
      : node.attrs;
  return node.type.create(
    attrs,
    children.length > 0 ? children : undefined,
    node.marks,
  );
}

function duplicateSelectedBlock(editor: Editor) {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection)) return false;
  const duplicate = cloneAuthoredNode(selection.node);
  const position = selection.to;
  const transaction = editor.state.tr.insert(position, duplicate);
  transaction.setSelection(NodeSelection.create(transaction.doc, position));
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

function prepareBlockInsertion(editor: Editor, preferredPosition: number) {
  const position = Math.max(0, preferredPosition);
  const node = editor.state.doc.nodeAt(position);
  if (!node) return false;
  if (node.type.name === 'paragraph' && node.content.size === 0) {
    editor.commands.setTextSelection(position + 1);
    return true;
  }
  const paragraph = editor.state.schema.nodes.paragraph?.create({
    id: createAuthoredId('paragraph'),
  });
  if (!paragraph) return false;
  const insertionPosition = position + node.nodeSize;
  const transaction = editor.state.tr.insert(insertionPosition, paragraph);
  transaction.setSelection(
    TextSelection.create(transaction.doc, insertionPosition + 1),
  );
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
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
    case 'accent':
      Icon = CaseSensitive;
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
    mediaHost,
    bookmarkProvider,
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
  const resolvedMediaHost = mediaHost ?? configuration?.capabilities.media;
  const configuredImageHost = imageHost ?? configuration?.capabilities.images;
  const resolvedImageHost = useMemo<ImageHost | undefined>(() => {
    if (configuredImageHost) return configuredImageHost;
    if (!resolvedMediaHost) return undefined;
    return {
      validate: (file) => resolvedMediaHost.validate?.({ kind: 'image', file }),
      upload: async ({ file, signal, onProgress }) => {
        const media = await resolvedMediaHost.upload({
          kind: 'image',
          file,
          signal,
          onProgress,
        });
        if (media.kind !== 'image')
          throw new Error('The media host did not return an image.');
        if (media.width === undefined || media.height === undefined)
          throw new Error('The media host did not return image dimensions.');
        return {
          assetId: media.assetId,
          src: media.src,
          width: media.width,
          height: media.height,
        };
      },
      resolve: async (assetId, signal) => {
        const media = await resolvedMediaHost.resolve(assetId, signal);
        return media?.kind === 'image' &&
          media.width !== undefined &&
          media.height !== undefined
          ? {
              assetId: media.assetId,
              src: media.src,
              width: media.width,
              height: media.height,
            }
          : undefined;
      },
      onRemoved: resolvedMediaHost.onRemoved,
    };
  }, [configuredImageHost, resolvedMediaHost]);
  const resolvedBookmarkProvider =
    bookmarkProvider ?? configuration?.capabilities.bookmarks;
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
        resolvedMediaHost,
        extensionRenderers,
      ),
    [
      placeholder,
      resolvedScriptureProvider,
      resolvedImageHost,
      resolvedMediaHost,
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
          media: resolvedMediaHost,
          bookmarks: resolvedBookmarkProvider,
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
    resolvedMediaHost,
    resolvedBookmarkProvider,
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
            else if (command.id === 'image')
              setCommandWorkflow({ type: 'image' });
            else if (command.id === 'video')
              setCommandWorkflow({ type: 'video' });
            else if (command.id === 'audio')
              setCommandWorkflow({ type: 'audio' });
            else if (command.id === 'web-bookmark')
              setCommandWorkflow({ type: 'bookmark' });
            else onCommand?.(command);
          },
        }),
      ),
    [commandCatalogue, extensionRenderers, onCommand],
  );
  const [slashQuery, setSlashQuery] = useState<string>();
  const [slashIndex, setSlashIndex] = useState(0);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
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

  const gutterMenuOpen = blockMenuOpen || insertMenuOpen;
  useEffect(() => {
    if (!gutterMenuOpen) return;
    editor?.commands.setMeta('lockDragHandle', true);
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      editor?.commands.setMeta('lockDragHandle', false);
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [editor, gutterMenuOpen]);

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
      insertVideo: (block) => {
        const content = canonicalToEditorJson({ version: 2, content: [block] })
          .content?.[0];
        if (content) void editor?.chain().focus().insertContent(content).run();
      },
      insertAudio: (block) => {
        const content = canonicalToEditorJson({ version: 2, content: [block] })
          .content?.[0];
        if (content) void editor?.chain().focus().insertContent(content).run();
      },
      insertBookmark: (block) => {
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
    if (codec.serialize(current) === serializedValue) return;

    // Tiptap node views may synchronously render React portals while content is
    // replaced. Deferring the replacement keeps that work outside React's
    // effect lifecycle and lets rapid controlled updates cancel stale writes.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed) return;
      editor.commands.setContent(canonicalToEditorJson(value), {
        emitUpdate: false,
      });
    });
    return () => {
      cancelled = true;
    };
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
        </div>
      ) : null}

      {editable ? (
        <BubbleMenu
          editor={editor}
          className="scriptr-editor__bubble"
          options={{ placement: 'top' }}
          shouldShow={({ state }) =>
            !state.selection.empty &&
            !(state.selection instanceof NodeSelection)
          }
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
            label="Accent font"
            active={editor.isActive('accent')}
            onPress={() =>
              void editor.chain().focus().toggleMark('accent').run()
            }
          >
            <span className="scriptr-editor__accent-control">Abc</span>
          </ToolbarButton>
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
            if (!gutterMenuOpen) activeBlockPositionRef.current = pos;
          }}
        >
          <div className="scriptr-editor__gutter-controls">
            <Popover
              onOpenChange={(open) => {
                if (open) {
                  setBlockMenuOpen(false);
                  if (
                    !prepareBlockInsertion(
                      editor,
                      activeBlockPositionRef.current,
                    )
                  )
                    return;
                }
                setInsertMenuOpen(open);
              }}
              open={insertMenuOpen}
            >
              <PopoverTrigger
                render={
                  <Button
                    aria-label="Insert block"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <Plus />
              </PopoverTrigger>
              {insertMenuOpen ? (
                <PopoverContent
                  align="start"
                  className="scriptr-editor__insert-menu"
                  side="left"
                >
                  <PopoverTitle className="sr-only">Insert block</PopoverTitle>
                  <Command aria-label="Insert block" shouldFilter>
                    <CommandInput
                      aria-label="Filter blocks"
                      autoFocus
                      placeholder="Search blocks…"
                    />
                    <CommandList>
                      {commandCatalogue.groups('').map((group) => (
                        <CommandGroup
                          heading={group.label}
                          key={group.category}
                        >
                          {group.commands.map((command) => {
                            const item = availableSlashItems.find(
                              (candidate) => candidate.id === command.id,
                            );
                            if (!item) return null;
                            return (
                              <CommandItem
                                key={item.id}
                                onSelect={() => {
                                  item.run(editor);
                                  setInsertMenuOpen(false);
                                }}
                                value={`${item.label} ${item.notation}`}
                              >
                                <CommandIconView icon={item.icon} />
                                <span>{item.label}</span>
                                <small>{item.notation}</small>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      ))}
                      <CommandEmpty>No matching blocks</CommandEmpty>
                    </CommandList>
                  </Command>
                </PopoverContent>
              ) : null}
            </Popover>
            <DropdownMenu
              modal={false}
              onOpenChange={(open) => {
                if (open) {
                  setInsertMenuOpen(false);
                  if (activeBlockPositionRef.current >= 0)
                    editor.commands.setNodeSelection(
                      activeBlockPositionRef.current,
                    );
                }
                setBlockMenuOpen(open);
              }}
              open={blockMenuOpen}
            >
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label="Drag block to reorder"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <GripVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="scriptr-editor__block-menu"
                side="left"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Block</DropdownMenuLabel>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Repeat2 data-icon="inline-start" />
                      Turn into
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      className="scriptr-editor__block-submenu"
                      side="left"
                    >
                      <DropdownMenuItem
                        onClick={() =>
                          void editor.chain().focus().setParagraph().run()
                        }
                      >
                        <Type data-icon="inline-start" /> Text
                      </DropdownMenuItem>
                      {([1, 2, 3] as const).map((level) => (
                        <DropdownMenuItem
                          key={level}
                          onClick={() =>
                            void editor
                              .chain()
                              .focus()
                              .setHeading({ level })
                              .run()
                          }
                        >
                          <Heading data-icon="inline-start" /> Heading {level}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem
                        onClick={() =>
                          void editor.chain().focus().toggleBlockquote().run()
                        }
                      >
                        <Quote data-icon="inline-start" /> Quote
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          if (
                            selectBlockText(
                              editor,
                              activeBlockPositionRef.current,
                            )
                          )
                            void editor
                              .chain()
                              .focus()
                              .toggleMark('accent')
                              .run();
                        }}
                      >
                        <CaseSensitive data-icon="inline-start" /> Accent
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          if (
                            selectBlockForAction(
                              editor,
                              activeBlockPositionRef.current,
                            )
                          )
                            replaceSelectedBlockWithColumns(editor);
                        }}
                      >
                        <Columns2 data-icon="inline-start" /> Columns
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          if (
                            selectBlockForAction(
                              editor,
                              activeBlockPositionRef.current,
                            )
                          )
                            replaceSelectedBlockWithToggle(editor);
                        }}
                      >
                        <ListCollapse data-icon="inline-start" /> Toggle
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <PaintRoller data-icon="inline-start" /> Colour
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      className="scriptr-editor__colour-submenu"
                      side="left"
                    >
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Text colour</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => {
                            if (
                              selectBlockText(
                                editor,
                                activeBlockPositionRef.current,
                              )
                            )
                              void editor
                                .chain()
                                .focus()
                                .unsetMark('textColour')
                                .run();
                          }}
                        >
                          <span className="scriptr-editor__colour-chip">
                            A
                          </span>{' '}
                          Default text
                        </DropdownMenuItem>
                        {(
                          [
                            ['#6f6a63', 'Gray'],
                            ['#9b5e3c', 'Brown'],
                            ['#b56b24', 'Orange'],
                            ['#a98520', 'Yellow'],
                            ['#398363', 'Green'],
                            ['#3978b9', 'Blue'],
                            ['#8056aa', 'Purple'],
                            ['#b84e7a', 'Pink'],
                            ['#b74d43', 'Red'],
                          ] as const
                        ).map(([colour, label]) => (
                          <DropdownMenuItem
                            key={colour}
                            onClick={() => {
                              if (
                                selectBlockText(
                                  editor,
                                  activeBlockPositionRef.current,
                                )
                              )
                                void editor
                                  .chain()
                                  .focus()
                                  .setMark('textColour', { colour })
                                  .run();
                            }}
                          >
                            <span
                              className="scriptr-editor__colour-chip"
                              style={{ color: colour }}
                            >
                              A
                            </span>
                            {label} text
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Highlight</DropdownMenuLabel>
                        {(
                          [
                            ['', 'No highlight'],
                            ['#ece9e4', 'Gray'],
                            ['#f1e6df', 'Brown'],
                            ['#f5e2cf', 'Orange'],
                            ['#f4ebcc', 'Yellow'],
                            ['#dfece5', 'Green'],
                            ['#dceaf5', 'Blue'],
                            ['#e8e0f2', 'Purple'],
                            ['#f2dfe7', 'Pink'],
                            ['#f3dfdc', 'Red'],
                          ] as const
                        ).map(([colour, label]) => (
                          <DropdownMenuItem
                            key={label}
                            onClick={() => {
                              if (
                                selectBlockText(
                                  editor,
                                  activeBlockPositionRef.current,
                                )
                              ) {
                                const chain = editor.chain().focus();
                                void (colour
                                  ? chain
                                      .setMark('highlightColour', { colour })
                                      .run()
                                  : chain.unsetMark('highlightColour').run());
                              }
                            }}
                          >
                            <span
                              className="scriptr-editor__colour-chip"
                              style={
                                colour ? { backgroundColor: colour } : undefined
                              }
                            />
                            {label}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Background</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() =>
                            void setBlockBackground(
                              editor,
                              activeBlockPositionRef.current,
                              null,
                            )
                          }
                        >
                          <span className="scriptr-editor__background-chip" />{' '}
                          Default background
                        </DropdownMenuItem>
                        {(
                          [
                            ['gray', 'Gray'],
                            ['brown', 'Brown'],
                            ['orange', 'Orange'],
                            ['yellow', 'Yellow'],
                            ['green', 'Green'],
                            ['blue', 'Blue'],
                            ['purple', 'Purple'],
                            ['pink', 'Pink'],
                            ['red', 'Red'],
                          ] as const
                        ).map(([background, label]) => (
                          <DropdownMenuItem
                            key={background}
                            onClick={() =>
                              void setBlockBackground(
                                editor,
                                activeBlockPositionRef.current,
                                background,
                              )
                            }
                          >
                            <span
                              className="scriptr-editor__background-chip"
                              data-background={background}
                            />
                            {label} background
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => {
                      if (
                        selectBlockForAction(
                          editor,
                          activeBlockPositionRef.current,
                        )
                      )
                        duplicateSelectedBlock(editor);
                    }}
                  >
                    <Copy data-icon="inline-start" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (
                        selectBlockForAction(
                          editor,
                          activeBlockPositionRef.current,
                        )
                      )
                        moveCurrentBlock(editor, -1);
                    }}
                  >
                    <ArrowUp data-icon="inline-start" /> Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (
                        selectBlockForAction(
                          editor,
                          activeBlockPositionRef.current,
                        )
                      )
                        moveCurrentBlock(editor, 1);
                    }}
                  >
                    <ArrowDown data-icon="inline-start" /> Move down
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() =>
                    void editor.chain().focus().deleteSelection().run()
                  }
                >
                  <Trash2 data-icon="inline-start" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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

      {commandWorkflow?.type === 'image' && resolvedImageHost ? (
        <Dialog
          onOpenChange={(open) => {
            if (!open) setCommandWorkflow(undefined);
          }}
          open
        >
          <DialogContent aria-label="Add image">
            <DialogHeader>
              <DialogTitle>Add image</DialogTitle>
            </DialogHeader>
            <ImageUploader
              createBlockId={() => createAuthoredId('image')}
              imageHost={resolvedImageHost}
              onCancel={() => setCommandWorkflow(undefined)}
              onUploaded={(block) => {
                const content = canonicalToEditorJson({
                  version: 2,
                  content: [block],
                }).content?.[0];
                if (content)
                  void editor.chain().focus().insertContent(content).run();
                setCommandWorkflow(undefined);
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {(commandWorkflow?.type === 'video' ||
        commandWorkflow?.type === 'audio') &&
      resolvedMediaHost ? (
        <Dialog
          onOpenChange={(open) => {
            if (!open) setCommandWorkflow(undefined);
          }}
          open
        >
          <DialogContent aria-label={`Add ${commandWorkflow.type}`}>
            <DialogHeader>
              <DialogTitle>Add {commandWorkflow.type}</DialogTitle>
            </DialogHeader>
            <MediaUploader
              createBlockId={() => createAuthoredId(commandWorkflow.type)}
              kind={commandWorkflow.type}
              mediaHost={resolvedMediaHost}
              onCancel={() => setCommandWorkflow(undefined)}
              onUploaded={(block) => {
                const content = canonicalToEditorJson({
                  version: 2,
                  content: [block],
                }).content?.[0];
                if (content)
                  void editor.chain().focus().insertContent(content).run();
                setCommandWorkflow(undefined);
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {commandWorkflow?.type === 'bookmark' && resolvedBookmarkProvider ? (
        <Dialog
          onOpenChange={(open) => {
            if (!open) setCommandWorkflow(undefined);
          }}
          open
        >
          <DialogContent aria-label="Add web bookmark">
            <DialogHeader>
              <DialogTitle>Add web bookmark</DialogTitle>
            </DialogHeader>
            <BookmarkComposer
              createBlockId={() => createAuthoredId('bookmark')}
              onAdd={(block) => {
                const content = canonicalToEditorJson({
                  version: 2,
                  content: [block],
                }).content?.[0];
                if (content)
                  void editor.chain().focus().insertContent(content).run();
                setCommandWorkflow(undefined);
              }}
              onCancel={() => setCommandWorkflow(undefined)}
              provider={resolvedBookmarkProvider}
            />
          </DialogContent>
        </Dialog>
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
