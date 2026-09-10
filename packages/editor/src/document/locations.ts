import type {
  Block,
  CanonicalDocument,
  InlineContent,
  ListItem,
} from './types.js';

export type CanonicalLocation = {
  readonly blockId: string;
  readonly kind: 'text' | 'reference' | 'scripture' | 'internalLink';
  readonly offset?: number | undefined;
  readonly length?: number | undefined;
  readonly referenceId?: string | undefined;
  readonly targetId?: string | undefined;
};

export type LocatedDocumentMatch = CanonicalLocation & {
  readonly context: string;
};

const inlineText = (content: readonly InlineContent[]) =>
  content.map((item) => (item.type === 'text' ? item.text : '\n')).join('');

function inlineSequences(block: Block): readonly (readonly InlineContent[])[] {
  if (
    block.type === 'paragraph' ||
    block.type === 'heading' ||
    block.type === 'blockquote' ||
    block.type === 'callout'
  )
    return [block.content];
  if (block.type === 'image' && block.caption) return [block.caption];
  if (block.type !== 'list') return [];
  const flatten = (items: readonly ListItem[]): (readonly InlineContent[])[] =>
    items.flatMap((item) => [item.content, ...flatten(item.children ?? [])]);
  return flatten(block.items);
}

function markAt(
  content: readonly InlineContent[],
  offset: number,
): { readonly referenceId?: string; readonly targetId?: string } {
  let cursor = 0;
  for (const inline of content) {
    const length = inline.type === 'text' ? inline.text.length : 1;
    if (offset < cursor + length && inline.type === 'text') {
      const reference = inline.marks?.find((mark) => mark.type === 'reference');
      const link = inline.marks?.find(
        (mark) => mark.type === 'internalDocumentLink',
      );
      return {
        ...(reference?.type === 'reference'
          ? { referenceId: reference.referenceId }
          : {}),
        ...(link?.type === 'internalDocumentLink'
          ? { targetId: link.targetId }
          : {}),
      };
    }
    cursor += length;
  }
  return {};
}

export function findDocumentLocations(
  document: CanonicalDocument,
  query: string,
): readonly LocatedDocumentMatch[] {
  const trimmed = query.trim();
  const needle = trimmed.toLocaleLowerCase();
  if (!needle) return [];
  const matches: LocatedDocumentMatch[] = [];
  for (const block of document.content) {
    let blockOffset = 0;
    for (const content of inlineSequences(block)) {
      const text = inlineText(content);
      let from = 0;
      while (from <= text.length) {
        const offset = text.toLocaleLowerCase().indexOf(needle, from);
        if (offset < 0) break;
        const marked = markAt(content, offset);
        matches.push({
          blockId: block.id,
          kind: marked.referenceId
            ? 'reference'
            : marked.targetId
              ? 'internalLink'
              : 'text',
          offset: blockOffset + offset,
          length: trimmed.length,
          ...marked,
          context: text.slice(
            Math.max(0, offset - 36),
            offset + needle.length + 36,
          ),
        });
        from = offset + Math.max(1, needle.length);
      }
      blockOffset += text.length;
    }
    if (block.type === 'scripture' || block.type === 'translationComparison') {
      const address = `${block.address.book} ${block.address.chapter}:${block.address.verseStart ?? 1}${block.address.verseEnd ? `-${block.address.verseEnd}` : ''}`;
      if (address.toLocaleLowerCase().includes(needle))
        matches.push({
          blockId: block.id,
          kind: 'scripture',
          context: address,
        });
    }
  }
  for (const [referenceId, reference] of Object.entries(
    document.references ?? {},
  )) {
    const text = reference.content
      .flatMap((item) => item.content.map((inline) => inline.text))
      .join(' ');
    if (!text.toLocaleLowerCase().includes(needle)) continue;
    const anchor = document.content.find((block) =>
      inlineSequences(block).some((content) =>
        content.some(
          (inline) =>
            inline.type === 'text' &&
            inline.marks?.some(
              (mark) =>
                mark.type === 'reference' && mark.referenceId === referenceId,
            ),
        ),
      ),
    );
    if (anchor)
      matches.push({
        blockId: anchor.id,
        kind: 'reference',
        referenceId,
        context: text,
      });
  }
  return matches;
}
