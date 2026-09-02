import type {
  Block,
  CanonicalDocument,
  InlineContent,
  ListItem,
  Mark,
} from './types.js';

export type InternalDocumentLinkEdge = {
  readonly targetId: string;
  readonly blockId: string;
  readonly path: readonly number[];
  readonly text: string;
  readonly context: string;
  readonly offsetStart: number;
  readonly offsetEnd: number;
};

function targetFromMarks(
  marks: readonly Mark[] | undefined,
): string | undefined {
  return marks?.find((mark) => mark.type === 'internalDocumentLink')?.targetId;
}

function extractInlineEdges(
  content: readonly InlineContent[],
  blockId: string,
  pathPrefix: readonly number[],
): InternalDocumentLinkEdge[] {
  const edges: InternalDocumentLinkEdge[] = [];
  const context = content
    .map((inline) => (inline.type === 'text' ? inline.text : '\n'))
    .join('');
  let offset = 0;
  for (const [index, inline] of content.entries()) {
    if (inline.type !== 'text') {
      offset += 1;
      continue;
    }
    const targetId = targetFromMarks(inline.marks);
    if (targetId) {
      edges.push({
        targetId,
        blockId,
        path: [...pathPrefix, index],
        text: inline.text,
        context,
        offsetStart: offset,
        offsetEnd: offset + inline.text.length,
      });
    }
    offset += inline.text.length;
  }
  return edges;
}

function extractListItemEdges(
  item: ListItem,
  blockId: string,
  path: readonly number[],
): InternalDocumentLinkEdge[] {
  const own = extractInlineEdges(item.content, blockId, path);
  const children =
    item.children?.flatMap((child, index) =>
      extractListItemEdges(child, blockId, [...path, index]),
    ) ?? [];
  return [...own, ...children];
}

function inlineContentFor(block: Block): readonly InlineContent[] | undefined {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
    case 'blockquote':
    case 'callout':
      return block.content;
    default:
      return undefined;
  }
}

export function extractInternalDocumentLinks(
  document: CanonicalDocument,
): readonly InternalDocumentLinkEdge[] {
  return document.content.flatMap((block) => {
    const inlineContent = inlineContentFor(block);
    if (inlineContent) return extractInlineEdges(inlineContent, block.id, []);
    if (block.type === 'image' && block.caption) {
      return extractInlineEdges(block.caption, block.id, []);
    }
    if (block.type === 'list') {
      return block.items.flatMap((item, index) =>
        extractListItemEdges(item, block.id, [index]),
      );
    }
    return [];
  });
}
