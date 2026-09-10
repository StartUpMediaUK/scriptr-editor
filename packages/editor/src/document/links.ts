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
    case 'toggle':
      return block.summary;
    default:
      return undefined;
  }
}

export function extractInternalDocumentLinks(
  document: CanonicalDocument,
): readonly InternalDocumentLinkEdge[] {
  const extractBlock = (block: Block): InternalDocumentLinkEdge[] => {
    const inlineContent = inlineContentFor(block);
    const own = inlineContent
      ? extractInlineEdges(inlineContent, block.id, [])
      : [];
    if ((block.type === 'image' || block.type === 'video') && block.caption) {
      own.push(...extractInlineEdges(block.caption, block.id, []));
    }
    if (block.type === 'audio' && block.transcript) {
      own.push(...extractInlineEdges(block.transcript, block.id, []));
    }
    if (block.type === 'columns') {
      own.push(
        ...block.columns.flatMap((column) =>
          column.content.flatMap(extractBlock),
        ),
      );
    }
    if (block.type === 'toggle') {
      own.push(...block.content.flatMap(extractBlock));
    }
    if (block.type === 'list') {
      own.push(
        ...block.items.flatMap((item, index) =>
          extractListItemEdges(item, block.id, [index]),
        ),
      );
    }
    return own;
  };
  return document.content.flatMap(extractBlock);
}
