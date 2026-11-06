import { Extension } from '@tiptap/core';
import {
  closeHistory,
  history,
  isHistoryTransaction,
  redo,
  undo,
} from '@tiptap/pm/history';
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';

type InputGroup = {
  kind: 'boundary' | 'typing' | 'composition' | 'backward' | 'forward';
  whitespace: boolean;
  composition: unknown;
  time?: number;
  replacement?: boolean;
};
const groupKey = new PluginKey<InputGroup>('scriptrInputGroup');
const boundary: InputGroup = {
  kind: 'boundary',
  whitespace: false,
  composition: undefined,
};

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function continuesGrapheme(tr: Transaction): boolean {
  const step = tr.steps[0];
  if (!(step instanceof ReplaceStep) || step.from !== step.to) return false;
  const position = tr.doc.resolve(step.from);
  const text = position.parent.textBetween(
    0,
    position.parent.content.size,
    '',
    '\ufffc',
  );
  const offset = position.parentOffset;
  const segment = graphemes.segment(text).containing(offset);
  return segment !== undefined && segment.index < offset;
}

function classify(tr: Transaction, state: EditorState): InputGroup {
  if (tr.getMeta('scriptrHistoryBoundary')) return boundary;
  if (tr.getMeta('scriptrExternal') || isHistoryTransaction(tr))
    return boundary;
  if (!tr.docChanged) {
    if (
      tr.storedMarksSet ||
      (tr.selectionSet && !tr.selection.eq(state.selection))
    )
      return boundary;
    return groupKey.getState(state) ?? boundary;
  }
  if (tr.getMeta('uiEvent') === 'paste' || tr.getMeta('uiEvent') === 'drop')
    return boundary;
  const composition: unknown = tr.getMeta('composition');
  if (composition !== undefined)
    return { kind: 'composition', whitespace: false, composition };
  const step = tr.steps.length === 1 ? tr.steps[0] : undefined;
  if (
    !(step instanceof ReplaceStep) ||
    step.slice.openStart ||
    step.slice.openEnd
  )
    return boundary;
  let text = '';
  let onlyText = true;
  const replacementBlock =
    !state.selection.empty &&
    step.slice.content.childCount === 1 &&
    step.slice.content.firstChild?.isTextblock
      ? step.slice.content.firstChild
      : undefined;
  (replacementBlock?.content ?? step.slice.content).forEach((node) => {
    if (!node.isText) onlyText = false;
    else text += node.text;
  });
  if (!onlyText) return boundary;
  if (text)
    return {
      kind: 'typing',
      whitespace: /\s$/u.test(text),
      composition,
      replacement: step.from !== step.to || !state.selection.empty,
    };
  if (!text && state.selection.empty) {
    const kind =
      step.to === state.selection.from
        ? 'backward'
        : step.from === state.selection.from
          ? 'forward'
          : 'boundary';
    return { kind, whitespace: false, composition };
  }
  return boundary;
}

/** Engine history shared by toolbar commands and keyboard shortcuts. */
export const EditingHistory = Extension.create({
  name: 'undoRedo',
  addCommands() {
    return {
      undo:
        () =>
        ({ state, dispatch }) =>
          undo(state, dispatch),
      redo:
        () =>
        ({ state, dispatch }) =>
          redo(state, dispatch),
    };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-z': () => this.editor.commands.undo(),
      'Mod-Shift-z': () => this.editor.commands.redo(),
      'Mod-y': () => this.editor.commands.redo(),
    };
  },
  addProseMirrorPlugins() {
    // Apply the 500ms idle rule below so a delayed combining character cannot
    // open a history group in the middle of a grapheme.
    const original: Plugin<unknown> = history({ newGroupDelay: Infinity });
    const field = original.spec.state;
    if (!field) throw new Error('History state is unavailable.');
    return [
      new Plugin<InputGroup>({
        key: groupKey,
        props: {
          handleKeyDown(view, event) {
            if (
              view.composing ||
              event.isComposing ||
              !/^(Arrow(Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(
                event.key,
              )
            )
              return false;
            // Native selectionchange can coalesce an away-and-back movement.
            // Close the engine group on intent without consuming the key.
            view.dispatch(
              closeHistory(
                view.state.tr.setMeta('scriptrHistoryBoundary', true),
              ),
            );
            return false;
          },
          handleDOMEvents: {
            pointerdown(view) {
              if (!view.composing)
                view.dispatch(
                  closeHistory(
                    view.state.tr.setMeta('scriptrHistoryBoundary', true),
                  ),
                );
              return false;
            },
          },
        },
        state: {
          init: () => boundary,
          apply: (tr, previous, state) =>
            tr.getMeta('appendedTransaction') ||
            tr.getMeta('addToHistory') === false
              ? previous
              : {
                  ...classify(tr, state),
                  ...(tr.docChanged ? { time: tr.time } : {}),
                },
        },
      }),
      new Plugin<unknown>({
        ...original.spec,
        state: {
          ...field,
          apply(tr, value, state, nextState) {
            if (tr.getMeta('scriptrExternal')) {
              tr.setMeta('addToHistory', false);
              return field.init({}, nextState);
            }
            if (
              (tr.docChanged ||
                tr.storedMarksSet ||
                (tr.selectionSet && !tr.selection.eq(state.selection)) ||
                tr.getMeta('scriptrHistoryBoundary')) &&
              !tr.getMeta('appendedTransaction') &&
              tr.getMeta('addToHistory') !== false &&
              !isHistoryTransaction(tr)
            ) {
              const previous = groupKey.getState(state) ?? boundary;
              const next = classify(tr, state);
              const step = tr.steps[0];
              const startsWord =
                next.kind === 'typing' &&
                previous.whitespace &&
                step instanceof ReplaceStep &&
                /^\S/u.test(
                  step.slice.content.textBetween(0, step.slice.content.size),
                );
              const sameComposition =
                next.kind === 'composition' &&
                previous.composition === next.composition;
              const continuation =
                next.kind === 'typing' &&
                previous.kind === 'typing' &&
                continuesGrapheme(tr);
              const idle =
                previous.time !== undefined &&
                tr.time - previous.time > 500 &&
                !sameComposition;
              if (
                next.kind === 'boundary' ||
                next.replacement ||
                previous.kind !== next.kind ||
                (!continuation && (startsWord || idle)) ||
                (next.kind === 'composition' &&
                  previous.composition !== next.composition)
              )
                closeHistory(tr);
            }
            return field.apply(tr, value, state, nextState);
          },
        },
      }),
    ];
  },
});
