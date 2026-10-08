import type { Node as EditorNode } from '@tiptap/pm/model';
import type { DocumentAnchor } from '../document/anchors.js';
import { createDocumentCodec } from '../document/codec.js';

export type MediaTextRegion = {
  readonly blockId: string;
  readonly field: 'caption' | 'transcript';
  readonly position: number;
  readonly text: string;
};

export function mediaTextRegions(doc: EditorNode): MediaTextRegion[] {
  const regions: MediaTextRegion[] = [];
  doc.descendants((node, position) => {
    if (node.type.name !== 'imageBlock' && node.type.name !== 'mediaBlock')
      return;
    const payload: unknown = node.attrs.payload;
    if (typeof payload !== 'string') return;
    const block = createDocumentCodec().parse({
      version: 2,
      content: [JSON.parse(payload)],
    }).content[0];
    if (
      !block ||
      (block.type !== 'image' &&
        block.type !== 'video' &&
        block.type !== 'audio')
    )
      return;
    const content = block.type === 'audio' ? block.transcript : block.caption;
    regions.push({
      blockId: block.id,
      field: block.type === 'audio' ? 'transcript' : 'caption',
      position,
      text: (content ?? [])
        .map((inline) => (inline.type === 'text' ? inline.text : '\n'))
        .join(''),
    });
  });
  return regions;
}

export function regionForAnchor(
  regions: readonly MediaTextRegion[],
  anchor: DocumentAnchor,
) {
  return regions.find(
    (region) =>
      region.blockId === anchor.blockId &&
      region.field === anchor.field &&
      anchor.itemId === undefined &&
      Number.isInteger(anchor.offset) &&
      Number.isInteger(anchor.length) &&
      anchor.offset >= 0 &&
      anchor.length >= 0 &&
      anchor.offset + anchor.length <= region.text.length,
  );
}

/** The smallest contiguous replacement, with UTF-16 offsets matching public anchors. */
export function textReplacement(before: string, after: string) {
  let start = 0;
  while (
    start < Math.min(before.length, after.length) &&
    before[start] === after[start]
  )
    start++;
  let suffix = 0;
  while (
    suffix < Math.min(before.length, after.length) - start &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix++;
  return {
    offset: start,
    length: before.length - start - suffix,
    inserted: after.length - start - suffix,
  };
}
