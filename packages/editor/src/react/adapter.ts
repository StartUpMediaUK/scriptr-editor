import type { JSONContent } from '@tiptap/core';
import { z } from 'zod';

import { createDocumentCodec } from '../document/codec.js';
import type {
  Block,
  CanonicalDocument,
  InlineContent,
  ListItem,
  Mark,
  Reference,
} from '../document/types.js';

type EditorMark = {
  type: string;
  attrs?: Record<string, unknown> | undefined;
};
type EditorNode = {
  type: string;
  attrs?: Record<string, unknown> | undefined;
  text?: string | undefined;
  marks?: EditorMark[] | undefined;
  content?: EditorNode[] | undefined;
};

const editorMarkSchema: z.ZodType<EditorMark> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
  }),
);
const editorNodeSchema: z.ZodType<EditorNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    text: z.string().optional(),
    marks: z.array(editorMarkSchema).optional(),
    content: z.array(editorNodeSchema).optional(),
  }),
);

function markToEditor(mark: Mark): EditorMark {
  switch (mark.type) {
    case 'strikethrough':
      return { type: 'strike' };
    case 'inlineCode':
      return { type: 'code' };
    case 'link':
      return {
        type: 'link',
        attrs: mark.title
          ? { href: mark.href, title: mark.title }
          : { href: mark.href },
      };
    case 'internalDocumentLink':
      return {
        type: 'internalDocumentLink',
        attrs: { targetId: mark.targetId },
      };
    case 'reference':
      return {
        type: 'referenceAnchor',
        attrs: { referenceId: mark.referenceId },
      };
    case 'textColour':
      return { type: 'textColour', attrs: { colour: mark.colour } };
    case 'highlightColour':
      return { type: 'highlightColour', attrs: { colour: mark.colour } };
    default:
      return { type: mark.type };
  }
}

function inlineToEditor(inline: InlineContent): EditorNode {
  if (inline.type === 'hardBreak') return { type: 'hardBreak' };
  return {
    type: 'text',
    text: inline.text,
    ...(inline.marks?.length ? { marks: inline.marks.map(markToEditor) } : {}),
  };
}

function listItemToEditor(
  item: ListItem,
  kind: 'bullet' | 'numbered' | 'check',
): EditorNode {
  const childType = kind === 'check' ? 'taskItem' : 'listItem';
  const listType =
    kind === 'bullet'
      ? 'bulletList'
      : kind === 'numbered'
        ? 'orderedList'
        : 'taskList';
  const content: EditorNode[] = [
    { type: 'paragraph', content: item.content.map(inlineToEditor) },
  ];
  if (item.children?.length) {
    content.push({
      type: listType,
      content: item.children.map((child) => listItemToEditor(child, kind)),
    });
  }
  return {
    type: childType,
    attrs:
      kind === 'check'
        ? { id: item.id, checked: item.checked ?? false }
        : { id: item.id },
    content,
  };
}

function opaqueBlockToEditor(block: Block): EditorNode {
  return {
    type:
      block.type === 'image'
        ? 'imageBlock'
        : block.type === 'video' || block.type === 'audio'
          ? 'mediaBlock'
          : block.type === 'webBookmark'
            ? 'bookmarkBlock'
            : block.type === 'scripture' ||
                block.type === 'translationComparison'
              ? 'scriptureBlock'
              : 'portableBlock',
    attrs: {
      id: block.id,
      blockType: block.type,
      payload: JSON.stringify(block),
    },
  };
}

function blockToEditor(block: Block): EditorNode {
  const inline = (content: readonly InlineContent[]) =>
    content.map(inlineToEditor);
  switch (block.type) {
    case 'paragraph':
      return {
        type: 'paragraph',
        attrs: { id: block.id },
        content: inline(block.content),
      };
    case 'heading':
      return {
        type: 'heading',
        attrs: { id: block.id, level: block.level },
        content: inline(block.content),
      };
    case 'blockquote':
      return {
        type: 'blockquote',
        attrs: { id: block.id },
        content: [{ type: 'paragraph', content: inline(block.content) }],
      };
    case 'codeBlock':
      return {
        type: 'codeBlock',
        attrs: { id: block.id, language: block.language ?? null },
        content: block.code ? [{ type: 'text', text: block.code }] : [],
      };
    case 'callout':
      return {
        type: 'callout',
        attrs: { id: block.id, tone: block.tone },
        content: inline(block.content),
      };
    case 'divider':
      return { type: 'horizontalRule', attrs: { id: block.id } };
    case 'list': {
      const type =
        block.kind === 'bullet'
          ? 'bulletList'
          : block.kind === 'numbered'
            ? 'orderedList'
            : 'taskList';
      return {
        type,
        attrs: { id: block.id, ...(block.start ? { start: block.start } : {}) },
        content: block.items.map((item) => listItemToEditor(item, block.kind)),
      };
    }
    case 'columns':
      return {
        type: 'columns',
        attrs: { id: block.id },
        content: block.columns.map((column) => ({
          type: 'column',
          attrs: { id: column.id },
          content: column.content.map(blockToEditor),
        })),
      };
    case 'toggle':
      return {
        type: 'toggle',
        attrs: {
          id: block.id,
          headingLevel: block.headingLevel ?? null,
          defaultOpen: block.defaultOpen ?? false,
        },
        content: [
          { type: 'toggleSummary', content: inline(block.summary) },
          {
            type: 'toggleContent',
            content: block.content.map(blockToEditor),
          },
        ],
      };
    default:
      return opaqueBlockToEditor(block);
  }
}

function toTiptapContent(node: EditorNode): JSONContent {
  return {
    type: node.type,
    ...(node.attrs ? { attrs: node.attrs } : {}),
    ...(node.text ? { text: node.text } : {}),
    ...(node.marks?.length
      ? {
          marks: node.marks.map((mark) => ({
            type: mark.type,
            ...(mark.attrs ? { attrs: mark.attrs } : {}),
          })),
        }
      : {}),
    ...(node.content ? { content: node.content.map(toTiptapContent) } : {}),
  };
}

export function canonicalToEditorJson(
  document: CanonicalDocument,
): JSONContent {
  return toTiptapContent({
    type: 'doc',
    content: document.content.map(blockToEditor),
  });
}

function stringAttr(node: EditorNode, key: string): string | undefined {
  const value = node.attrs?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberAttr(node: EditorNode, key: string): number | undefined {
  const value = node.attrs?.[key];
  return typeof value === 'number' ? value : undefined;
}

function editorMarkToCanonical(mark: EditorMark): Mark | undefined {
  switch (mark.type) {
    case 'bold':
    case 'italic':
    case 'underline':
      return { type: mark.type };
    case 'strike':
      return { type: 'strikethrough' };
    case 'code':
      return { type: 'inlineCode' };
    case 'link': {
      const href = mark.attrs?.href;
      const title = mark.attrs?.title;
      if (typeof href !== 'string') return undefined;
      return typeof title === 'string'
        ? { type: 'link', href, title }
        : { type: 'link', href };
    }
    case 'internalDocumentLink': {
      const targetId = mark.attrs?.targetId;
      return typeof targetId === 'string'
        ? { type: 'internalDocumentLink', targetId }
        : undefined;
    }
    case 'referenceAnchor': {
      const referenceId = mark.attrs?.referenceId;
      return typeof referenceId === 'string'
        ? { type: 'reference', referenceId }
        : undefined;
    }
    case 'textColour':
    case 'highlightColour': {
      const colour = mark.attrs?.colour;
      return typeof colour === 'string'
        ? { type: mark.type, colour }
        : undefined;
    }
    default:
      return undefined;
  }
}

function editorInlineToCanonical(
  nodes: readonly EditorNode[],
): InlineContent[] {
  return nodes.flatMap((node): InlineContent[] => {
    if (node.type === 'hardBreak') return [{ type: 'hardBreak' }];
    if (node.type !== 'text' || !node.text) return [];
    const marks = node.marks?.flatMap((mark) => {
      const converted = editorMarkToCanonical(mark);
      return converted ? [converted] : [];
    });
    return [
      marks?.length
        ? { type: 'text', text: node.text, marks }
        : { type: 'text', text: node.text },
    ];
  });
}

function listItemFromEditor(
  node: EditorNode,
  kind: 'bullet' | 'numbered' | 'check',
  fallbackId: string,
): ListItem {
  const paragraph = node.content?.find((child) => child.type === 'paragraph');
  const nested = node.content?.find((child) =>
    ['bulletList', 'orderedList', 'taskList'].includes(child.type),
  );
  const checked = node.attrs?.checked;
  const children = nested?.content?.map((child, index) =>
    listItemFromEditor(child, kind, `${fallbackId}-${index + 1}`),
  );
  return {
    id: stringAttr(node, 'id') ?? fallbackId,
    content: editorInlineToCanonical(paragraph?.content ?? []),
    ...(kind === 'check' ? { checked: checked === true } : {}),
    ...(children?.length ? { children } : {}),
  };
}

function editorNodeToBlock(node: EditorNode, index: number): Block | undefined {
  const id = stringAttr(node, 'id') ?? `block-${index + 1}`;
  switch (node.type) {
    case 'paragraph':
      return {
        id,
        type: 'paragraph',
        content: editorInlineToCanonical(node.content ?? []),
      };
    case 'heading': {
      const level = numberAttr(node, 'level');
      if (
        level !== 1 &&
        level !== 2 &&
        level !== 3 &&
        level !== 4 &&
        level !== 5 &&
        level !== 6
      )
        return undefined;
      return {
        id,
        type: 'heading',
        level,
        content: editorInlineToCanonical(node.content ?? []),
      };
    }
    case 'blockquote': {
      const paragraph = node.content?.find(
        (child) => child.type === 'paragraph',
      );
      return {
        id,
        type: 'blockquote',
        content: editorInlineToCanonical(paragraph?.content ?? []),
      };
    }
    case 'codeBlock': {
      const language = stringAttr(node, 'language');
      const code =
        node.content?.map((child) => child.text ?? '').join('') ?? '';
      return language
        ? { id, type: 'codeBlock', code, language }
        : { id, type: 'codeBlock', code };
    }
    case 'callout': {
      const tone = stringAttr(node, 'tone');
      return {
        id,
        type: 'callout',
        tone: tone === 'info' || tone === 'warning' ? tone : 'note',
        content: editorInlineToCanonical(node.content ?? []),
      };
    }
    case 'horizontalRule':
      return { id, type: 'divider' };
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      const kind =
        node.type === 'bulletList'
          ? 'bullet'
          : node.type === 'orderedList'
            ? 'numbered'
            : 'check';
      const items = (node.content ?? []).map((item, itemIndex) =>
        listItemFromEditor(item, kind, `${id}-item-${itemIndex + 1}`),
      );
      if (items.length === 0) return undefined;
      const start = numberAttr(node, 'start');
      return kind === 'numbered' && start
        ? { id, type: 'list', kind, start, items }
        : { id, type: 'list', kind, items };
    }
    case 'columns': {
      const columns = (node.content ?? []).flatMap((column, columnIndex) => {
        if (column.type !== 'column') return [];
        const content = (column.content ?? []).flatMap((child, childIndex) => {
          const block = editorNodeToBlock(child, childIndex);
          return block ? [block] : [];
        });
        return content.length
          ? [
              {
                id:
                  stringAttr(column, 'id') ?? `${id}-column-${columnIndex + 1}`,
                content,
              },
            ]
          : [];
      });
      return columns.length >= 2 && columns.length <= 4
        ? { id, type: 'columns', columns }
        : undefined;
    }
    case 'toggle': {
      const summary = node.content?.find(
        (child) => child.type === 'toggleSummary',
      );
      const body = node.content?.find(
        (child) => child.type === 'toggleContent',
      );
      const content = (body?.content ?? []).flatMap((child, childIndex) => {
        const block = editorNodeToBlock(child, childIndex);
        return block ? [block] : [];
      });
      if (!content.length) return undefined;
      const headingLevel = numberAttr(node, 'headingLevel');
      return {
        id,
        type: 'toggle',
        summary: editorInlineToCanonical(summary?.content ?? []),
        ...(headingLevel === 1 || headingLevel === 2 || headingLevel === 3
          ? { headingLevel }
          : {}),
        ...(node.attrs?.defaultOpen === true ? { defaultOpen: true } : {}),
        content,
      };
    }
    case 'portableBlock':
    case 'scriptureBlock':
    case 'imageBlock':
    case 'mediaBlock':
    case 'bookmarkBlock': {
      const payload = stringAttr(node, 'payload');
      if (!payload) return undefined;
      const parsed: unknown = JSON.parse(payload);
      const document = createDocumentCodec().parse({
        version: 2,
        content: [parsed],
      });
      return document.content[0];
    }
    default:
      return undefined;
  }
}

function reconcileReferenceData(
  blocks: readonly Block[],
  references: Readonly<Record<string, Reference>> | undefined,
  anchored = new Set<string>(),
) {
  const inline = (content: readonly InlineContent[]): InlineContent[] =>
    content.map((item) => {
      if (item.type !== 'text' || !item.marks) return item;
      const marks = item.marks.filter((mark) => {
        if (mark.type !== 'reference') return true;
        if (!references?.[mark.referenceId]) return false;
        anchored.add(mark.referenceId);
        return true;
      });
      return marks.length
        ? { ...item, marks }
        : { type: 'text', text: item.text };
    });
  const listItems = (items: readonly ListItem[]): ListItem[] =>
    items.map((item) => ({
      ...item,
      content: inline(item.content),
      ...(item.children ? { children: listItems(item.children) } : {}),
    }));
  const content = blocks.map((block): Block => {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
      case 'blockquote':
      case 'callout':
        return { ...block, content: inline(block.content) };
      case 'list':
        return { ...block, items: listItems(block.items) };
      case 'image':
        return block.caption
          ? { ...block, caption: inline(block.caption) }
          : block;
      case 'video':
        return block.caption
          ? { ...block, caption: inline(block.caption) }
          : block;
      case 'audio':
        return block.transcript
          ? { ...block, transcript: inline(block.transcript) }
          : block;
      case 'columns':
        return {
          ...block,
          columns: block.columns.map((column) => ({
            ...column,
            content: reconcileReferenceData(
              column.content,
              references,
              anchored,
            ).content,
          })),
        };
      case 'toggle':
        return {
          ...block,
          summary: inline(block.summary),
          content: reconcileReferenceData(block.content, references, anchored)
            .content,
        };
      default:
        return block;
    }
  });
  const retainedReferences = references
    ? Object.fromEntries(
        Object.entries(references).filter(([id]) => anchored.has(id)),
      )
    : undefined;
  return {
    content,
    references:
      retainedReferences && Object.keys(retainedReferences).length
        ? retainedReferences
        : undefined,
  };
}

export function editorJsonToCanonical(
  input: unknown,
  references?: Readonly<Record<string, Reference>>,
): CanonicalDocument {
  const editorDocument = editorNodeSchema.parse(input);
  if (editorDocument.type !== 'doc')
    throw new Error('Editor JSON must have a doc root.');
  const parsedContent = (editorDocument.content ?? []).flatMap(
    (node, index) => {
      const block = editorNodeToBlock(node, index);
      return block ? [block] : [];
    },
  );
  const { content, references: reconciledReferences } = reconcileReferenceData(
    parsedContent,
    references,
  );
  return createDocumentCodec().parse(
    reconciledReferences
      ? { version: 2, content, references: reconciledReferences }
      : { version: 2, content },
  );
}
