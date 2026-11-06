/** @vitest-environment jsdom */
import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { undoDepth, redoDepth, isHistoryTransaction } from '@tiptap/pm/history';
import { createEditorExtensions } from './editor-extensions.js';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { createTransactionTracker } from './change-tracker.js';
import type { DocumentChangeDetails } from '../document/changes.js';

describe('editing history', () => {
  it('groups a native whole-document selection replacement with the rest of its word', () => {
    const editor = new Editor({
      extensions: createEditorExtensions('Write'),
      content: '<p>one</p>',
    });
    try {
      editor.commands.selectAll();
      const paragraph = editor.schema.nodes.paragraph;
      if (!paragraph) throw Error('Paragraph schema missing');
      editor.view.dispatch(
        editor.state.tr.replaceSelectionWith(
          paragraph.create(null, editor.schema.text('t')),
        ),
      );
      editor.view.dispatch(
        editor.state.tr.setMeta('bubbleMenu', { type: 'updateOptions' }),
      );
      for (const text of 'wo') editor.commands.insertContent(text);
      editor.commands.undo();
      expect(editor.getText()).toBe('one');
    } finally {
      editor.destroy();
    }
  });
  it('keeps the word replacing a selection together and separate from preceding typing', () => {
    const editor = new Editor({
      extensions: createEditorExtensions('Write'),
      content: '<p></p>',
    });
    try {
      editor.commands.insertContent('one');
      editor.commands.setTextSelection({ from: 1, to: 4 });
      for (const text of 'two') editor.commands.insertContent(text);
      editor.commands.undo();
      expect(editor.getText()).toBe('one');
      editor.commands.redo();
      expect(editor.getText()).toBe('two');
    } finally {
      editor.destroy();
    }
  });
  it('separates rapid caret keys even when native selectionchange coalesces them', () => {
    const editor = new Editor({
      extensions: createEditorExtensions('Write'),
      content: '<p></p>',
    });
    try {
      editor.commands.insertContent('one');
      for (const key of ['ArrowLeft', 'ArrowRight'])
        editor.view.someProp('handleKeyDown', (handler) =>
          handler(editor.view, new KeyboardEvent('keydown', { key })),
        );
      editor.commands.insertContent('x');
      editor.commands.undo();
      expect(editor.getText()).toBe('one');
    } finally {
      editor.destroy();
    }
  });
  it('restores contribution identities through word undo/redo and resets checkpoints on replacement', () => {
    const editor = new Editor({
      extensions: createEditorExtensions('Write'),
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { id: 'p' } }],
      },
    });
    const tracker = createTransactionTracker(editor.state.doc);
    const details: DocumentChangeDetails[] = [];
    let previousRedo = 0;
    editor.on('transaction', ({ transaction, appendedTransactions }) => {
      if (!transaction.docChanged) return;
      const rawDepth: unknown = redoDepth(editor.state);
      const depth = typeof rawDepth === 'number' ? rawDepth : 0;
      const source = transaction.getMeta('scriptrExternal')
        ? 'external'
        : isHistoryTransaction(transaction)
          ? depth > previousRedo
            ? 'undo'
            : 'redo'
          : 'input';
      previousRedo = depth;
      const combined = EditorState.create({ doc: transaction.before }).tr;
      for (const tr of [transaction, ...appendedTransactions])
        for (const step of tr.steps) combined.step(step);
      const rawUndoDepth: unknown = undoDepth(editor.state);
      details.push(
        tracker.update(
          combined,
          source,
          typeof rawUndoDepth === 'number' ? rawUndoDepth : undefined,
        ),
      );
    });
    try {
      let time = Date.now();
      for (const text of 'one two three')
        editor.view.dispatch(
          editor.state.tr.insertText(text).setTime((time += 20)),
        );
      const authored = details.at(-1)?.contributions;
      for (let i = 0; i < 3; i++) editor.commands.undo();
      expect(details.at(-1)).toMatchObject({
        source: 'undo',
        provenance: 'complete',
        contributions: [],
      });
      for (let i = 0; i < 3; i++) editor.commands.redo();
      expect(details.at(-1)).toMatchObject({
        source: 'redo',
        provenance: 'complete',
        contributions: authored,
      });
      editor
        .chain()
        .setMeta('scriptrExternal', true)
        .setContent('<p data-id="p">remote</p>', { emitUpdate: false })
        .run();
      expect(details.at(-1)).toMatchObject({
        source: 'external',
        additions: [],
      });
      editor.commands.setTextSelection(7);
      editor.commands.insertContent('new');
      editor.commands.undo();
      expect(editor.getText()).toBe('remote');
      expect(undoDepth(editor.state)).toBe(0);
    } finally {
      editor.destroy();
    }
  });
  it('does not split a grapheme when its combining mark arrives after an idle pause', () => {
    const editor = new Editor({
      extensions: createEditorExtensions('Write'),
      content: '<p></p>',
    });
    try {
      editor.view.dispatch(editor.state.tr.insertText('e').setTime(1000));
      editor.view.dispatch(editor.state.tr.insertText('\u0301').setTime(1800));
      expect(editor.getText()).toBe('e\u0301');
      editor.commands.undo();
      expect(editor.getText()).toBe('');
      editor.commands.redo();
      expect(editor.getText()).toBe('e\u0301');
    } finally {
      editor.destroy();
    }
  });
  it('retains the idle boundary inside a word', () => {
    const editor = new Editor({
      extensions: createEditorExtensions('Write'),
      content: '<p></p>',
    });
    try {
      const now = Date.now();
      editor.view.dispatch(editor.state.tr.insertText('o').setTime(now));
      editor.view.dispatch(editor.state.tr.insertText('ne').setTime(now + 601));
      editor.commands.undo();
      expect(editor.getText()).toBe('o');
    } finally {
      editor.destroy();
    }
  });

  it.each(['paste', 'formatting', 'enter', 'heading', 'caret'] as const)(
    'separates %s from typing before and after',
    (action) => {
      const editor = new Editor({
        extensions: createEditorExtensions('Write'),
        content: '<p></p>',
      });
      try {
        editor.view.dispatch(editor.state.tr.insertText('one').setTime(1000));
        if (action === 'paste')
          editor.view.dispatch(
            editor.state.tr
              .insertText('paste')
              .setMeta('uiEvent', 'paste')
              .setTime(1100),
          );
        else if (action === 'formatting') editor.commands.toggleBold();
        else if (action === 'enter') editor.commands.splitBlock();
        else if (action === 'heading') editor.commands.setHeading({ level: 1 });
        else {
          editor.view.dispatch(
            editor.state.tr.setSelection(
              TextSelection.create(editor.state.doc, 1),
            ),
          );
          editor.view.dispatch(
            editor.state.tr.setSelection(
              TextSelection.create(editor.state.doc, 4),
            ),
          );
        }
        const before = editor.getJSON();
        editor.view.dispatch(editor.state.tr.insertText('next').setTime(1200));
        editor.commands.undo();
        expect(editor.getJSON()).toEqual(before);
        if (action !== 'caret' && action !== 'formatting') {
          editor.commands.undo();
          expect(editor.getText()).toBe('one');
        }
      } finally {
        editor.destroy();
      }
    },
  );

  it('separates deletion directions and abandons redo on fresh typing', () => {
    const editor = new Editor({
      extensions: createEditorExtensions('Write'),
      content: '<p>abcd</p>',
    });
    try {
      editor.commands.setTextSelection(3);
      editor.view.dispatch(editor.state.tr.delete(2, 3).setTime(1000));
      editor.view.dispatch(editor.state.tr.delete(2, 3).setTime(1050));
      expect(editor.getText()).toBe('ad');
      editor.commands.undo();
      expect(editor.getText()).toBe('acd');
      editor.commands.undo();
      expect(editor.getText()).toBe('abcd');
      editor.commands.insertContent('new');
      expect(redoDepth(editor.state)).toBe(0);
    } finally {
      editor.destroy();
    }
  });

  it('keeps graphemes and a multi-update composition in one group', () => {
    const editor = new Editor({
      extensions: createEditorExtensions('Write'),
      content: '<p></p>',
    });
    try {
      for (const [index, text] of ['👩🏽‍💻', 'e\u0301', ' '].entries())
        editor.view.dispatch(
          editor.state.tr.insertText(text).setTime(1000 + index * 30),
        );
      editor.view.dispatch(
        editor.state.tr
          .insertText('に')
          .setMeta('composition', 1)
          .setTime(1200),
      );
      editor.view.dispatch(
        editor.state.tr
          .insertText(
            '日本',
            editor.state.selection.from - 1,
            editor.state.selection.from,
          )
          .setMeta('composition', 1)
          .setTime(1800),
      );
      editor.commands.undo();
      expect(editor.getText()).toBe('👩🏽‍💻e\u0301 ');
      editor.commands.undo();
      expect(editor.getText()).toBe('');
      editor.commands.redo();
      editor.commands.redo();
      expect(editor.getText()).toBe('👩🏽‍💻e\u0301 日本');
    } finally {
      editor.destroy();
    }
  });
  it('undoes uninterrupted words separately, including trailing whitespace', () => {
    const editor = new Editor({
      extensions: createEditorExtensions('Write'),
      content: '<p></p>',
    });
    try {
      let time = 1000;
      for (const character of 'one two three') {
        editor.view.dispatch(
          editor.state.tr.insertText(character).setTime((time += 30)),
        );
      }
      expect(undoDepth(editor.state)).toBe(3);
      for (const text of ['one two ', 'one ', '']) {
        editor.commands.undo();
        expect(editor.getText()).toBe(text);
      }
      expect(redoDepth(editor.state)).toBe(3);
      for (const text of ['one ', 'one two ', 'one two three']) {
        editor.commands.redo();
        expect(editor.getText()).toBe(text);
      }
    } finally {
      editor.destroy();
    }
  });

  it('clears both history branches on external replacement', () => {
    const editor = new Editor({
      extensions: createEditorExtensions('Write'),
      content: '<p></p>',
    });
    try {
      editor.commands.insertContent('local');
      editor
        .chain()
        .setMeta('scriptrExternal', true)
        .setContent('<p>remote</p>', { emitUpdate: false })
        .run();
      expect(undoDepth(editor.state)).toBe(0);
      expect(redoDepth(editor.state)).toBe(0);
      editor.commands.undo();
      expect(editor.getText()).toBe('remote');
    } finally {
      editor.destroy();
    }
  });
});
