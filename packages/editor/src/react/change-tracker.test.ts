/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { history, undo, redo } from '@tiptap/pm/history';
import { createTransactionTracker } from './change-tracker.js';
import { anchorAtPosition, positionForAnchor } from './anchor-adapter.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'text*',
      group: 'block',
      attrs: { id: { default: 'p' } },
    },
    atom: { group: 'block', atom: true, attrs: { id: {} } },
    bulletList: { group: 'block', content: 'listItem+', attrs: { id: {} } },
    listItem: {
      content: 'paragraph bulletList?',
      attrs: { id: { default: 'item' } },
    },
    text: { group: 'inline' },
  },
  marks: { bold: {} },
});
const make = () =>
  EditorState.create({
    schema,
    doc: schema.node('doc', null, [
      schema.node('paragraph', { id: 'p' }, schema.text('Old text')),
    ]),
    plugins: [history()],
  });

describe('neutral change provenance', () => {
  it('retains grouped undo/redo provenance after more than 1,000 keystrokes', () => {
    let state = make();
    const tracker = createTransactionTracker(state.doc);
    for (let index = 0; index < 1005; index++) {
      const transaction = state.tr
        .insertText('a', state.doc.child(0).nodeSize - 1)
        .setTime(1);
      tracker.update(transaction, 'input', 1);
      state = state.apply(transaction);
    }
    undo(state, (tr) => {
      const details = tracker.update(tr, 'undo', 0);
      expect(details.provenance).toBe('complete');
      expect(details.contributions).toEqual([]);
      state = state.apply(tr);
    });
    redo(state, (tr) => {
      const details = tracker.update(tr, 'redo', 1);
      expect(details.provenance).toBe('complete');
      expect(details.restoredContributionIds).toHaveLength(1005);
      expect(details.additions).toEqual([]);
    });
  });
  it('reports unresolved history without inventing new contributions', () => {
    const state = make();
    const details = createTransactionTracker(state.doc).update(
      state.tr.insertText('Unknown history', 9),
      'redo',
    );
    expect(details.provenance).toBe('unresolved');
    expect(details.additions).toEqual([]);
    expect(details.contributions).toEqual([]);
  });
  it('resolves nested list items against the canonical outer list identity', () => {
    const doc = schema.node('doc', null, [
      schema.node('bulletList', { id: 'outer' }, [
        schema.node('listItem', { id: 'first' }, [
          schema.node('paragraph', { id: 'first-text' }, schema.text('One')),
          schema.node('bulletList', { id: 'engine-only-inner' }, [
            schema.node('listItem', { id: 'nested' }, [
              schema.node(
                'paragraph',
                { id: 'nested-text' },
                schema.text('Two'),
              ),
            ]),
          ]),
        ]),
      ]),
    ]);
    let position = 0;
    doc.descendants((node, start) => {
      if (node.attrs.id === 'nested-text') position = start + 1;
    });
    const anchor = anchorAtPosition(doc, position, 3);
    expect(anchor).toEqual({
      blockId: 'outer',
      itemId: 'nested',
      field: 'content',
      offset: 0,
      length: 3,
    });
    expect(anchor && positionForAnchor(doc, anchor)).toBe(position);
  });

  it('retains the identity of replaced writing without creating an addition', () => {
    let state = make();
    const tracker = createTransactionTracker(state.doc);
    const transaction = state.tr.insertText('abc', 9);
    const added = tracker.update(transaction, 'input');
    state = state.apply(transaction);
    const replaced = tracker.update(
      state.tr.insertText('longer', 9, 12),
      'input',
    );
    expect(replaced.additions).toEqual([]);
    expect(replaced.contributions[0]?.id).toBe(added.additions[0]?.id);
    expect(replaced.contributions[0]?.anchors[0]?.length).toBe(6);
  });

  it('reports mixed replacement and insertion independently', () => {
    const state = make();
    const details = createTransactionTracker(state.doc).update(
      state.tr.insertText('New', 1, 4).insertText(' plus', 9),
      'paste',
    );
    expect(details.kinds).toEqual(['insertion', 'replacement']);
    expect(details.additions[0]?.anchors[0]?.length).toBe(5);
  });

  it('preserves contributions when an identified block moves and then joins', () => {
    let state = make();
    const tracker = createTransactionTracker(state.doc);
    let transaction = state.tr
      .insertText('abc', 9)
      .insert(
        13,
        schema.node('paragraph', { id: 'second' }, schema.text('Tail')),
      );
    const added = tracker.update(transaction, 'input');
    state = state.apply(transaction);
    const paragraph = state.doc.child(0);
    transaction = state.tr.delete(0, paragraph.nodeSize);
    transaction.insert(transaction.doc.content.size, paragraph);
    const moved = tracker.update(transaction, 'input');
    expect(moved.additions).toEqual([]);
    expect(moved.contributions.map((c) => c.id).sort()).toEqual(
      added.contributions.map((c) => c.id).sort(),
    );
    state = state.apply(transaction);
    const joined = tracker.update(
      state.tr.join(state.doc.child(0).nodeSize),
      'input',
    );
    expect(joined.additions).toEqual([]);
    expect(joined.contributions.map((c) => c.id).sort()).toEqual(
      added.contributions.map((c) => c.id).sort(),
    );
  });

  it('restores all contribution identities in grouped history', () => {
    let state = make();
    const tracker = createTransactionTracker(state.doc);
    const ids: string[] = [];
    for (const text of ['a', 'b', 'c']) {
      const transaction = state.tr.insertText(
        text,
        state.doc.child(0).nodeSize - 1,
      );
      const details = tracker.update(transaction, 'input');
      ids.push(...details.additions.map((c) => c.id));
      state = state.apply(transaction);
    }
    undo(state, (tr) => {
      expect(tracker.update(tr, 'undo').removedContributionIds).toEqual(ids);
      state = state.apply(tr);
    });
    redo(state, (tr) => {
      const details = tracker.update(tr, 'redo');
      expect(details.restoredContributionIds).toEqual(ids);
      expect(details.additions).toEqual([]);
    });
  });

  it('reports typing and paste additions at portable positions', () => {
    const state = make();
    const tracker = createTransactionTracker(state.doc);
    const typed = tracker.update(state.tr.insertText(' new', 9), 'input');
    expect(typed.kinds).toEqual(['insertion']);
    expect(typed.additions[0]?.anchors).toEqual([
      {
        blockId: 'p',
        itemId: undefined,
        field: 'content',
        offset: 8,
        length: 4,
      },
    ]);
    expect(typed.additions[0]?.id).toBeTruthy();
  });

  it('does not mistake replacement or formatting for new writing', () => {
    const state = make();
    const replacement = createTransactionTracker(state.doc).update(
      state.tr.insertText('Other', 1, 4),
      'input',
    );
    expect(replacement.kinds).toEqual(['replacement']);
    expect(replacement.additions).toEqual([]);
    const formatting = createTransactionTracker(state.doc).update(
      state.tr.addMark(1, 4, schema.mark('bold')),
      'input',
    );
    expect(formatting.kinds).toEqual(['formatting']);
    expect(formatting.additions).toEqual([]);
  });

  it('preserves partially deleted contributions and updates surviving offsets', () => {
    let state = make();
    const tracker = createTransactionTracker(state.doc);
    let transaction = state.tr.insertText('abc', 9);
    const added = tracker.update(transaction, 'input');
    state = state.apply(transaction);
    transaction = state.tr.delete(10, 11);
    const removed = tracker.update(transaction, 'input');
    expect(removed.additions).toEqual([]);
    expect(removed.contributions[0]?.id).toBe(added.additions[0]?.id);
    expect(removed.contributions[0]?.anchors[0]?.length).toBe(2);
  });

  it('classifies composition transactions as authored input', () => {
    const state = make();
    const details = createTransactionTracker(state.doc).update(
      state.tr.insertText('日本語', 9).setMeta('composition', 1),
      'input',
    );
    expect(details.source).toBe('input');
    expect(details.additions[0]?.anchors[0]?.length).toBe(3);
  });

  it('restores exact contribution identities through real undo and redo', () => {
    let state = make();
    const tracker = createTransactionTracker(state.doc);
    const transaction = state.tr.insertText('abc', 9);
    const added = tracker.update(transaction, 'input');
    state = state.apply(transaction);
    undo(state, (tr) => {
      const details = tracker.update(tr, 'undo');
      expect(details.contributions).toEqual([]);
      expect(details.removedContributionIds).toEqual([added.additions[0]?.id]);
      state = state.apply(tr);
    });
    redo(state, (tr) => {
      const details = tracker.update(tr, 'redo');
      expect(details.contributions).toEqual(added.contributions);
      expect(details.restoredContributionIds).toEqual([added.additions[0]?.id]);
      expect(details.additions).toEqual([]);
    });
  });

  it('does not classify controlled external values as user additions', () => {
    const state = make();
    expect(
      createTransactionTracker(state.doc).update(
        state.tr.insertText('remote', 9),
        'external',
      ).additions,
    ).toEqual([]);
  });

  it('maps contribution ranges across a paragraph split without adding old text', () => {
    let state = make();
    const tracker = createTransactionTracker(state.doc);
    let transaction = state.tr.insertText('abcd', 9);
    const added = tracker.update(transaction, 'input');
    state = state.apply(transaction);
    transaction = state.tr.split(11, 1, [
      { type: schema.nodes.paragraph, attrs: { id: 'second' } },
    ]);
    const split = tracker.update(transaction, 'input');
    expect(split.additions).toEqual([]);
    expect(split.contributions[0]?.id).toBe(added.additions[0]?.id);
    expect(split.contributions[0]?.anchors).toHaveLength(2);
  });

  it('tracks authored atom insertion but not atom configuration changes', () => {
    let state = make();
    const tracker = createTransactionTracker(state.doc);
    const transaction = state.tr.insert(
      10,
      schema.node('atom', { id: 'image' }),
    );
    const added = tracker.update(transaction, 'input');
    state = state.apply(transaction);
    expect(added.additions[0]?.anchors[0]?.field).toBe('block');
    expect(
      tracker.update(
        state.tr.setNodeMarkup(10, undefined, { id: 'image' }),
        'input',
      ).additions,
    ).toEqual([]);
  });

  it('resolves empty caret locations and refuses invalid ranges', () => {
    const state = make();
    expect(anchorAtPosition(state.doc, 9)).toEqual({
      blockId: 'p',
      itemId: undefined,
      field: 'content',
      offset: 8,
      length: 0,
    });
    expect(
      positionForAnchor(state.doc, {
        blockId: 'p',
        field: 'content',
        offset: 99,
        length: 0,
      }),
    ).toBeUndefined();
    expect(
      createTransactionTracker(state.doc).update(
        state.tr.setSelection(TextSelection.create(state.doc, 3)),
        'input',
      ).additions,
    ).toEqual([]);
  });
});
