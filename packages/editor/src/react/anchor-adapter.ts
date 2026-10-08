import type { Node as EditorNode } from '@tiptap/pm/model';
import type { DocumentAnchor } from '../document/anchors.js';

/** Engine positions stay private; callers persist only portable anchors. */
export function anchorAtPosition(
  doc: EditorNode,
  position: number,
  length = 0,
): DocumentAnchor | undefined {
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    position > doc.content.size
  )
    return undefined;
  const resolved = doc.resolve(position);
  if (
    !resolved.parent.isTextblock ||
    !Number.isInteger(length) ||
    length < 0 ||
    resolved.parentOffset + length > resolved.parent.content.size
  )
    return undefined;
  const field =
    resolved.parent.type.name === 'toggleSummary'
      ? 'summary'
      : resolved.parent.type.name === 'codeBlock'
        ? 'code'
        : 'content';
  let blockId: string | undefined;
  let itemId: string | undefined;
  for (let depth = resolved.depth; depth > 0; depth--) {
    const node = resolved.node(depth);
    if (
      (node.type.name === 'listItem' || node.type.name === 'taskItem') &&
      !itemId
    ) {
      if (typeof node.attrs.id === 'string') itemId = node.attrs.id;
    }
    if (typeof node.attrs.id !== 'string') continue;
    if (
      itemId &&
      ['bulletList', 'orderedList', 'taskList'].includes(node.type.name)
    ) {
      blockId = node.attrs.id;
      continue;
    }
    if (!itemId && !blockId) blockId = node.attrs.id;
  }
  return blockId
    ? { blockId, itemId, field, offset: resolved.parentOffset, length }
    : undefined;
}

export function positionForAnchor(
  doc: EditorNode,
  anchor: DocumentAnchor,
): number | undefined {
  if (
    !Number.isInteger(anchor.offset) ||
    !Number.isInteger(anchor.length) ||
    anchor.offset < 0 ||
    anchor.length < 0 ||
    (anchor.field === 'block' &&
      (anchor.offset !== 0 ||
        anchor.length !== 0 ||
        anchor.itemId !== undefined))
  )
    return undefined;
  let found: number | undefined;
  doc.descendants((node, position) => {
    if (found !== undefined) return false;
    if (anchor.field === 'block' && node.attrs.id === anchor.blockId) {
      found = position;
      return false;
    }
    if (!node.isTextblock) return true;
    const candidate = anchorAtPosition(doc, position + 1);
    if (
      candidate?.blockId === anchor.blockId &&
      candidate.itemId === anchor.itemId &&
      candidate.field === anchor.field &&
      anchor.offset >= 0 &&
      anchor.offset + anchor.length <= node.content.size
    ) {
      found = position + 1 + anchor.offset;
    }
    return false;
  });
  return found;
}
