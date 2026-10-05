import type { Editor } from '@tiptap/core';
import { Fragment, Slice, type Node } from '@tiptap/pm/model';
import { referenceSchema } from '../document/schema.js';
import type { Reference } from '../document/types.js';

export function parseReferenceMetadata(value: unknown): Reference | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const result = referenceSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function updateReferenceMetadata(editor: Editor, reference: Reference) {
  const transaction = editor.state.tr;
  editor.state.doc.descendants((node, position) => {
    for (const mark of node.marks) {
      if (
        mark.type.name === 'referenceAnchor' &&
        mark.attrs.referenceId === reference.id
      ) {
        transaction.addMark(
          position,
          position + node.nodeSize,
          mark.type.create({
            referenceId: reference.id,
            referenceData: JSON.stringify(reference),
          }),
        );
      }
    }
  });
  if (transaction.docChanged) editor.view.dispatch(transaction);
}

/** Every pasted annotation receives its own identity, even within one editor. */
export function remapPastedReferences(slice: Slice): Slice {
  const identities = new Map<string, string>();
  const mapNode = (node: Node): Node => {
    const marks = node.marks.flatMap((mark) => {
      if (mark.type.name !== 'referenceAnchor') return [mark];
      const reference = parseReferenceMetadata(mark.attrs.referenceData);
      if (!reference || reference.id !== mark.attrs.referenceId) return [];
      let id = identities.get(reference.id);
      if (!id) {
        id = Array.from(
          globalThis.crypto.getRandomValues(new Uint8Array(16)),
          (byte) => byte.toString(16).padStart(2, '0'),
        ).join('');
        identities.set(reference.id, id);
      }
      return [
        mark.type.create({
          referenceId: id,
          referenceData: JSON.stringify({ ...reference, id }),
        }),
      ];
    });
    const children: Node[] = [];
    node.content.forEach((child) => children.push(mapNode(child)));
    return node.copy(Fragment.from(children)).mark(marks);
  };
  const content: Node[] = [];
  slice.content.forEach((node) => content.push(mapNode(node)));
  return new Slice(Fragment.from(content), slice.openStart, slice.openEnd);
}
