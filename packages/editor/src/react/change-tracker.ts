import type { Node as EditorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import type {
  ContentContribution,
  DocumentChangeDetails,
} from '../document/changes.js';
import { anchorAtPosition, positionForAnchor } from './anchor-adapter.js';
import type { DocumentAnchor } from '../document/anchors.js';
import {
  mediaTextRegions,
  regionForAnchor,
  textReplacement,
} from './media-regions.js';

type Token = {
  readonly id: string;
  readonly position: number;
  readonly blockId?: string | undefined;
  readonly anchor?: DocumentAnchor | undefined;
};
type Snapshot = {
  readonly doc: EditorNode;
  readonly tokens: readonly Token[];
  readonly historyDepth?: number | undefined;
  readonly provenance: DocumentChangeDetails['provenance'];
};

// Controlled setContent replaces the entire engine document. Recover only the
// unchanged prefix/suffix of the same identified text region; never search for
// matching text elsewhere or infer authorship for the remote edit itself.
function createExternalRecovery(before: EditorNode, after: EditorNode) {
  const regions = new Map<
    EditorNode,
    | { start: number; prefix: number; suffixStart: number; delta: number }
    | undefined
  >();
  return (token: Token): Token | undefined => {
    const anchor = anchorAtPosition(before, token.position, 1);
    if (!anchor) return undefined;
    const oldParent = before.resolve(token.position).parent;
    if (!regions.has(oldParent)) {
      const start = positionForAnchor(after, {
        ...anchor,
        offset: 0,
        length: 0,
      });
      if (start === undefined) {
        regions.set(oldParent, undefined);
        return undefined;
      }
      const newParent = after.resolve(start).parent;
      const oldText = oldParent.textBetween(
        0,
        oldParent.content.size,
        '',
        '\n',
      );
      const newText = newParent.textBetween(
        0,
        newParent.content.size,
        '',
        '\n',
      );
      let prefix = 0;
      while (
        prefix < Math.min(oldText.length, newText.length) &&
        oldText[prefix] === newText[prefix]
      )
        prefix++;
      let suffix = 0;
      while (
        suffix < Math.min(oldText.length, newText.length) - prefix &&
        oldText[oldText.length - suffix - 1] ===
          newText[newText.length - suffix - 1]
      )
        suffix++;
      regions.set(oldParent, {
        start,
        prefix,
        suffixStart: oldText.length - suffix,
        delta: newText.length - oldText.length,
      });
    }
    const region = regions.get(oldParent);
    if (!region) return undefined;
    const offset =
      anchor.offset < region.prefix
        ? anchor.offset
        : anchor.offset >= region.suffixStart
          ? anchor.offset + region.delta
          : undefined;
    return offset === undefined
      ? undefined
      : { ...token, position: region.start + offset };
  };
}

const summarize = (
  doc: EditorNode,
  tokens: readonly Token[],
): ContentContribution[] => {
  const mediaRegions = mediaTextRegions(doc);
  const groups = new Map<string, Token[]>();
  for (const token of tokens) {
    const group = groups.get(token.id);
    if (group) group.push(token);
    else groups.set(token.id, [token]);
  }
  return [...groups]
    .map(([id, entries]) => {
      const anchors: ContentContribution['anchors'][number][] = [];
      for (const entry of [...entries].sort(
        (a, b) =>
          a.position - b.position ||
          (a.anchor?.offset ?? 0) - (b.anchor?.offset ?? 0),
      )) {
        const anchor = entry.anchor
          ? regionForAnchor(mediaRegions, entry.anchor)
            ? entry.anchor
            : undefined
          : entry.blockId &&
              doc.nodeAt(entry.position)?.attrs.id === entry.blockId
            ? {
                blockId: entry.blockId,
                field: 'block' as const,
                offset: 0,
                length: 0,
              }
            : anchorAtPosition(doc, entry.position, 1);
        if (!anchor) continue;
        const previous = anchors.at(-1);
        if (
          previous &&
          previous.blockId === anchor.blockId &&
          previous.itemId === anchor.itemId &&
          previous.field === anchor.field &&
          previous.offset + previous.length === anchor.offset
        )
          anchors[anchors.length - 1] = {
            ...previous,
            length: previous.length + 1,
          };
        else anchors.push(anchor);
      }
      return { id, anchors };
    })
    .filter((contribution) => contribution.anchors.length > 0);
};

/** Optional editor-side provenance, never marks or nodes in authored content. */
export function createTransactionTracker(
  initial: EditorNode,
  seed: readonly ContentContribution[] = [],
) {
  const initialRegions = mediaTextRegions(initial);
  const initialTokens = seed.flatMap((contribution) =>
    contribution.anchors.flatMap((anchor) => {
      const region = regionForAnchor(initialRegions, anchor);
      if (region)
        return Array.from({ length: anchor.length }, (_, offset) => ({
          id: contribution.id,
          position: region.position,
          anchor: { ...anchor, offset: anchor.offset + offset, length: 1 },
        }));
      const position = positionForAnchor(initial, anchor);
      if (position === undefined)
        throw new RangeError(
          'Contribution anchor cannot be restored by this editing surface.',
        );
      return anchor.field === 'block'
        ? [{ id: contribution.id, position, blockId: anchor.blockId }]
        : Array.from({ length: anchor.length }, (_, offset) => ({
            id: contribution.id,
            position: position + offset,
          }));
    }),
  );
  let snapshots: Snapshot[] = [
    {
      doc: initial,
      tokens: initialTokens,
      historyDepth: 0,
      provenance: 'complete',
    },
  ];
  let cursor = 0;
  let serial = 0;
  const prefix = globalThis.crypto.randomUUID();
  return {
    update(
      transaction: Transaction,
      source: DocumentChangeDetails['source'],
      historyDepth?: number,
    ): DocumentChangeDetails {
      const previous = snapshots[cursor];
      if (!previous) throw new Error('Change tracker state is missing.');
      const before = summarize(previous.doc, previous.tokens);
      let tokens: readonly Token[];
      let additions: ContentContribution[] = [];
      let kinds: DocumentChangeDetails['kinds'] = [];
      let provenance = previous.provenance;
      if (source === 'undo' || source === 'redo') {
        const indices =
          source === 'undo'
            ? Array.from({ length: cursor }, (_, index) => cursor - index - 1)
            : Array.from(
                { length: snapshots.length - cursor - 1 },
                (_, index) => cursor + index + 1,
              );
        const matched = indices.find((index) =>
          snapshots[index]?.doc.eq(transaction.doc),
        );
        if (matched === undefined) {
          provenance = 'unresolved';
          tokens = [];
          snapshots = [
            { doc: transaction.doc, tokens, historyDepth, provenance },
          ];
          cursor = 0;
        } else {
          cursor = matched;
          tokens = snapshots[cursor]?.tokens ?? [];
          provenance = snapshots[cursor]?.provenance ?? 'unresolved';
        }
        kinds = ['structure'];
      } else {
        const recoverExternalToken = createExternalRecovery(
          previous.doc,
          transaction.doc,
        );
        const oldRegions = mediaTextRegions(previous.doc);
        const newRegions = mediaTextRegions(transaction.doc);
        const fieldTokens = previous.tokens.filter((token) => token.anchor);
        // Preserve surviving characters individually, including partial deletions and splits.
        tokens = previous.tokens.flatMap((token) => {
          if (token.anchor) return [];
          if (token.blockId) {
            const position = positionForAnchor(transaction.doc, {
              blockId: token.blockId,
              field: 'block',
              offset: 0,
              length: 0,
            });
            if (position === undefined && source === 'external')
              provenance = 'unresolved';
            return position === undefined ? [] : [{ ...token, position }];
          }
          const mapped = transaction.mapping.mapResult(token.position, 1);
          const end = transaction.mapping.mapResult(token.position + 1, -1);
          if (!mapped.deleted && !end.deleted && end.pos > mapped.pos)
            return [{ ...token, position: mapped.pos }];
          if (source === 'external') {
            const recovered = recoverExternalToken(token);
            if (!recovered) provenance = 'unresolved';
            return recovered ? [recovered] : [];
          }
          if (source === 'paste') return [];
          // Moving an intact identified text region is not a new contribution.
          const oldAnchor = anchorAtPosition(previous.doc, token.position, 1);
          const position = oldAnchor
            ? positionForAnchor(transaction.doc, oldAnchor)
            : undefined;
          if (
            position !== undefined &&
            previous.doc.textBetween(token.position, token.position + 1) ===
              transaction.doc.textBetween(position, position + 1) &&
            transaction.doc
              .resolve(position)
              .parent.eq(previous.doc.resolve(token.position).parent)
          )
            return [{ ...token, position }];
          return [];
        });
        const inserted: Token[] = [];
        const inherited: Token[] = [];
        const occupied = new Set(tokens.map((token) => token.position));
        let replacement = false;
        let deletion = false;
        const fieldEdit: unknown = transaction.getMeta('scriptrFieldEdit');
        const survivingFieldTokens: Token[] = [];
        for (const oldRegion of oldRegions) {
          const next = newRegions.find(
            (region) =>
              region.blockId === oldRegion.blockId &&
              region.field === oldRegion.field,
          );
          const owned = fieldTokens.filter(
            (token) =>
              token.anchor?.blockId === oldRegion.blockId &&
              token.anchor.field === oldRegion.field,
          );
          if (!next) {
            if (source === 'external' && owned.length)
              provenance = 'unresolved';
            continue;
          }
          let change = textReplacement(oldRegion.text, next.text);
          if (
            source === 'paste' &&
            typeof fieldEdit === 'object' &&
            fieldEdit !== null &&
            'blockId' in fieldEdit &&
            fieldEdit.blockId === oldRegion.blockId &&
            'field' in fieldEdit &&
            fieldEdit.field === oldRegion.field &&
            'replacement' in fieldEdit
          ) {
            const range = fieldEdit.replacement;
            if (
              typeof range === 'object' &&
              range !== null &&
              'offset' in range &&
              'length' in range &&
              typeof range.offset === 'number' &&
              typeof range.length === 'number' &&
              Number.isInteger(range.offset) &&
              Number.isInteger(range.length) &&
              range.offset >= 0 &&
              range.length >= 0 &&
              range.offset + range.length <= oldRegion.text.length
            ) {
              const insertedLength =
                next.text.length - oldRegion.text.length + range.length;
              if (
                insertedLength >= 0 &&
                oldRegion.text.slice(0, range.offset) ===
                  next.text.slice(0, range.offset) &&
                oldRegion.text.slice(range.offset + range.length) ===
                  next.text.slice(range.offset + insertedLength)
              )
                change = {
                  offset: range.offset,
                  length: range.length,
                  inserted: insertedLength,
                };
            }
          }
          const changed = change.length > 0 || change.inserted > 0;
          deletion ||= change.length > 0;
          replacement ||= change.length > 0 && change.inserted > 0;
          const removed = owned.filter(
            (token) =>
              token.anchor &&
              token.anchor.offset >= change.offset &&
              token.anchor.offset < change.offset + change.length,
          );
          for (const token of owned) {
            const anchor = token.anchor;
            if (!anchor) continue;
            if (
              anchor.offset >= change.offset &&
              anchor.offset < change.offset + change.length
            ) {
              if (source === 'external') provenance = 'unresolved';
              continue;
            }
            survivingFieldTokens.push({
              ...token,
              position: next.position,
              anchor: {
                ...anchor,
                offset:
                  anchor.offset < change.offset
                    ? anchor.offset
                    : anchor.offset + change.inserted - change.length,
              },
            });
          }
          if (!changed || source === 'external') continue;
          const owner =
            source !== 'paste' && change.length > 0
              ? removed[0]?.id
              : undefined;
          if (change.length > 0 && source !== 'paste' && !owner) continue;
          const id = owner ?? `${prefix}:${++serial}`;
          const target = owner ? inherited : inserted;
          for (let offset = 0; offset < change.inserted; offset++)
            target.push({
              id,
              position: next.position,
              anchor: {
                blockId: next.blockId,
                field: next.field,
                offset: change.offset + offset,
                length: 1,
              },
            });
        }
        for (const [index, step] of transaction.steps.entries()) {
          step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
            const oldText =
              transaction.docs[index]?.textBetween(oldStart, oldEnd, '', '') ??
              '';
            const following = transaction.mapping.slice(index + 1);
            const start = following.map(newStart, 1);
            const end = following.map(newEnd, -1);
            deletion ||= oldText.length > 0;
            replacement ||= oldText.length > 0 && end > start;
            if (source === 'external') return;
            if (oldText.length > 0 && source !== 'paste') {
              // Editing attributed text retains its provenance, without new authorship.
              const owner = previous.tokens.find(
                (token) =>
                  !token.blockId &&
                  !token.anchor &&
                  transaction.mapping.slice(0, index).map(token.position, 1) >=
                    oldStart &&
                  transaction.mapping.slice(0, index).map(token.position, 1) <
                    oldEnd,
              );
              if (owner)
                for (let position = start; position < end; position++)
                  if (
                    anchorAtPosition(transaction.doc, position, 1) &&
                    !occupied.has(position)
                  ) {
                    inherited.push({ id: owner.id, position });
                    occupied.add(position);
                  }
              return;
            }
            const id = `${prefix}:${++serial}`;
            for (let position = start; position < end; position++) {
              const anchor = anchorAtPosition(transaction.doc, position, 1);
              if (
                !anchor ||
                (source !== 'paste' &&
                  positionForAnchor(previous.doc, anchor) !== undefined &&
                  transaction.doc
                    .resolve(position)
                    .parent.eq(
                      previous.doc.resolve(
                        positionForAnchor(previous.doc, anchor) ?? 0,
                      ).parent,
                    ))
              )
                continue;
              const character = transaction.doc.textBetween(
                position,
                position + 1,
                '',
                '',
              );
              if (character && !occupied.has(position)) {
                inserted.push({ id, position });
                occupied.add(position);
              }
            }
          });
        }
        if (source !== 'external') {
          const existingBlocks = new Set<string>();
          previous.doc.descendants((node) => {
            if (typeof node.attrs.id === 'string')
              existingBlocks.add(node.attrs.id);
          });
          transaction.doc.descendants((node, position) => {
            if (
              node.isAtom &&
              node.isBlock &&
              typeof node.attrs.id === 'string' &&
              !existingBlocks.has(node.attrs.id)
            )
              inserted.push({
                id: `${prefix}:${++serial}`,
                position,
                blockId: node.attrs.id,
              });
          });
        }
        tokens = [
          ...tokens,
          ...survivingFieldTokens,
          ...inherited,
          ...inserted,
        ];
        additions = summarize(transaction.doc, inserted);
        kinds = [
          ...(additions.length ? (['insertion'] as const) : []),
          ...(replacement ? (['replacement'] as const) : []),
          ...(deletion && !replacement ? (['deletion'] as const) : []),
        ];
        if (!kinds.length) kinds = ['formatting'];
        if (source === 'external') kinds = ['structure'];
        const merge =
          historyDepth !== undefined && previous.historyDepth === historyDepth;
        snapshots = [
          ...snapshots.slice(0, merge ? cursor : cursor + 1),
          { doc: transaction.doc, tokens, historyDepth, provenance },
        ];
        if (!merge) cursor++;
        if (source === 'external') {
          snapshots = [
            { doc: transaction.doc, tokens, historyDepth: 0, provenance },
          ];
          cursor = 0;
        }
        // Keep history-group checkpoints, not a snapshot for every keystroke.
        if (snapshots.length > 1000) {
          snapshots = snapshots.slice(-1000);
          cursor = snapshots.length - 1;
        }
      }
      const contributions = summarize(transaction.doc, tokens);
      const previousIds = new Set(before.map((c) => c.id));
      const currentIds = new Set(contributions.map((c) => c.id));
      return {
        version: 1,
        provenance,
        source,
        kinds,
        additions,
        contributions,
        removedContributionIds:
          provenance === 'unresolved'
            ? []
            : [...previousIds].filter((id) => !currentIds.has(id)),
        restoredContributionIds:
          source === 'undo' || source === 'redo'
            ? [...currentIds].filter((id) => !previousIds.has(id))
            : [],
      };
    },
  };
}
