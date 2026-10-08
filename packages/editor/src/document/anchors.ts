import type {
  Block,
  CanonicalDocument,
  InlineContent,
  ListItem,
} from './types.js';

/** Portable position in authored content, independent of an editing engine. */
export type DocumentAnchor = {
  readonly blockId: string;
  readonly itemId?: string | undefined;
  readonly field:
    | 'content'
    | 'summary'
    | 'code'
    | 'caption'
    | 'transcript'
    | 'block';
  readonly offset: number;
  readonly length: number;
};

export type DocumentTextRegion = {
  readonly blockId: string;
  readonly itemId?: string | undefined;
  readonly field: DocumentAnchor['field'];
  readonly text: string;
};

const text = (content: readonly InlineContent[]) =>
  content
    .map((inline) => (inline.type === 'text' ? inline.text : '\n'))
    .join('');

/** References and resolved provider text deliberately have no authored text region. */
export function documentTextRegions(
  document: CanonicalDocument,
): readonly DocumentTextRegion[] {
  const visit = (blocks: readonly Block[]): DocumentTextRegion[] =>
    blocks.flatMap((block) => {
      const region = (
        field: DocumentAnchor['field'],
        value: string,
      ): DocumentTextRegion => ({ blockId: block.id, field, text: value });
      switch (block.type) {
        case 'paragraph':
        case 'heading':
        case 'blockquote':
        case 'callout':
          return [region('content', text(block.content))];
        case 'codeBlock':
          return [region('code', block.code)];
        case 'toggle':
          return [
            region('summary', text(block.summary)),
            ...visit(block.content),
          ];
        case 'columns':
          return block.columns.flatMap((column) => visit(column.content));
        case 'list': {
          const items = (values: readonly ListItem[]): DocumentTextRegion[] =>
            values.flatMap((item) => [
              {
                blockId: block.id,
                itemId: item.id,
                field: 'content',
                text: text(item.content),
              },
              ...items(item.children ?? []),
            ]);
          return items(block.items);
        }
        case 'image':
        case 'video':
          return block.caption ? [region('caption', text(block.caption))] : [];
        case 'audio':
          return block.transcript
            ? [region('transcript', text(block.transcript))]
            : [];
        default:
          return [];
      }
    });
  return visit(document.content);
}

export function resolveDocumentAnchor(
  document: CanonicalDocument,
  anchor: DocumentAnchor,
): DocumentAnchor | undefined {
  if (
    !Number.isInteger(anchor.offset) ||
    !Number.isInteger(anchor.length) ||
    anchor.offset < 0 ||
    anchor.length < 0
  )
    return undefined;
  if (anchor.field === 'block') {
    const contains = (blocks: readonly Block[]): boolean =>
      blocks.some(
        (block) =>
          block.id === anchor.blockId ||
          (block.type === 'toggle' && contains(block.content)) ||
          (block.type === 'columns' &&
            block.columns.some((column) => contains(column.content))),
      );
    return anchor.itemId === undefined &&
      anchor.offset === 0 &&
      anchor.length === 0 &&
      contains(document.content)
      ? anchor
      : undefined;
  }
  const region = documentTextRegions(document).find(
    (candidate) =>
      candidate.blockId === anchor.blockId &&
      candidate.itemId === anchor.itemId &&
      candidate.field === anchor.field,
  );
  return region && anchor.offset + anchor.length <= region.text.length
    ? anchor
    : undefined;
}

/** Migrations supply explicit identity maps; missing text/ranges remain unresolved. */
export function remapDocumentAnchor(
  document: CanonicalDocument,
  anchor: DocumentAnchor,
  identities: {
    readonly blocks?: Readonly<Record<string, string>>;
    readonly items?: Readonly<Record<string, string>>;
  } = {},
): DocumentAnchor | undefined {
  return resolveDocumentAnchor(document, {
    ...anchor,
    blockId: identities.blocks?.[anchor.blockId] ?? anchor.blockId,
    itemId: anchor.itemId
      ? (identities.items?.[anchor.itemId] ?? anchor.itemId)
      : undefined,
  });
}
