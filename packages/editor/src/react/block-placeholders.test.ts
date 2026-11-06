/** @vitest-environment jsdom */
import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from './editor-extensions.js';
import { editorJsonToCanonical } from './adapter.js';

describe('block placeholders', () => {
  it('labels each empty heading without adding authored content', () => {
    const editor = new Editor({
      extensions: createEditorExtensions('Write here'),
      content: '<p></p>',
    });
    try {
      for (const level of [1, 2, 3, 4, 5, 6] as const) {
        editor.commands.setHeading({ level });
        expect(
          editor.view.dom
            .querySelector(`h${level}`)
            ?.getAttribute('data-placeholder'),
        ).toBe(`Heading ${level}`);
        expect(editor.getText()).toBe('');
        expect(
          editorJsonToCanonical(editor.getJSON()).content[0],
        ).toMatchObject({ type: 'heading', level, content: [] });
        expect(editor.getHTML()).not.toContain('data-placeholder');
        editor.commands.insertContent('Text');
        expect(editor.view.dom.querySelector('[data-placeholder]')).toBeNull();
        for (let count = 0; count < 4; count++) {
          const position = editor.state.selection.from;
          editor.view.dispatch(editor.state.tr.delete(position - 1, position));
        }
        expect(editor.getText()).toBe('');
        expect(
          editor.view.dom
            .querySelector(`h${level}`)
            ?.getAttribute('data-placeholder'),
        ).toBe(`Heading ${level}`);
      }
    } finally {
      editor.destroy();
    }
  });

  it('updates an empty heading immediately across undo and redo', () => {
    const editor = new Editor({
      extensions: createEditorExtensions('Write'),
      content: '<h1></h1>',
    });
    try {
      editor.commands.setHeading({ level: 2 });
      expect(
        editor.view.dom.querySelector('h2')?.getAttribute('data-placeholder'),
      ).toBe('Heading 2');
      editor.commands.undo();
      expect(
        editor.view.dom.querySelector('h1')?.getAttribute('data-placeholder'),
      ).toBe('Heading 1');
      editor.commands.redo();
      expect(
        editor.view.dom.querySelector('h2')?.getAttribute('data-placeholder'),
      ).toBe('Heading 2');
    } finally {
      editor.destroy();
    }
  });
});
