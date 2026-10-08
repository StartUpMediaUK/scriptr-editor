import type { Node as EditorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import type {
  ContentContribution,
  DocumentChangeDetails,
} from '../document/changes.js';
import { anchorAtPosition, positionForAnchor } from './anchor-adapter.js';

type Token = {
  readonly id: string;
  readonly position: number;
  readonly blockId?: string | undefined;
};
type Snapshot = {
  readonly doc: EditorNode;
  readonly tokens: readonly Token[];
  readonly historyDepth?: number | undefined;
};

const summarize = (
  doc: EditorNode,
  tokens: readonly Token[],
): ContentContribution[] => {
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
        (a, b) => a.position - b.position,
      )) {
        const anchor =
          entry.blockId &&
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
  const initialTokens = seed.flatMap((contribution) =>
    contribution.anchors.flatMap((anchor) => {
      const position = positionForAnchor(initial, anchor);
      return position === undefined
        ? []
        : anchor.field === 'block'
          ? [{ id: contribution.id, position, blockId: anchor.blockId }]
          : Array.from({ length: anchor.length }, (_, offset) => ({
              id: contribution.id,
              position: position + offset,
            }));
    }),
  );
  let snapshots: Snapshot[] = [
    { doc: initial, tokens: initialTokens, historyDepth: 0 },
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
      let provenance: DocumentChangeDetails['provenance'] = 'complete';
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
          snapshots = [{ doc: transaction.doc, tokens, historyDepth }];
          cursor = 0;
        } else {
          cursor = matched;
          tokens = snapshots[cursor]?.tokens ?? [];
        }
        kinds = ['structure'];
      } else {
        // Preserve surviving characters individually, including partial deletions and splits.
        tokens = previous.tokens.flatMap((token) => {
          if (token.blockId) {
            const position = positionForAnchor(transaction.doc, {
              blockId: token.blockId,
              field: 'block',
              offset: 0,
              length: 0,
            });
            return position === undefined ? [] : [{ ...token, position }];
          }
          const mapped = transaction.mapping.mapResult(token.position, 1);
          const end = transaction.mapping.mapResult(token.position + 1, -1);
          if (!mapped.deleted && !end.deleted && end.pos > mapped.pos)
            return [{ ...token, position: mapped.pos }];
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
            if (oldText.length > 0) {
              // Editing attributed text retains its provenance, without new authorship.
              const owner = previous.tokens.find(
                (token) =>
                  !token.blockId &&
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
                (positionForAnchor(previous.doc, anchor) !== undefined &&
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
        tokens = [...tokens, ...inherited, ...inserted];
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
          { doc: transaction.doc, tokens, historyDepth },
        ];
        if (!merge) cursor++;
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
        removedContributionIds: [...previousIds].filter(
          (id) => !currentIds.has(id),
        ),
        restoredContributionIds:
          source === 'undo' || source === 'redo'
            ? [...currentIds].filter((id) => !previousIds.has(id))
            : [],
      };
    },
  };
}
