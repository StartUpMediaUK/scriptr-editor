import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { ReactNode } from 'react';
import type { DocumentAnchor } from '../document/anchors.js';
import { positionForAnchor } from './anchor-adapter.js';

export type ExternalAnnotation = {
  readonly id: string;
  readonly anchor: DocumentAnchor;
};

export type ExternalAnnotationProps = {
  readonly annotations?: readonly ExternalAnnotation[] | undefined;
  /** Return inline-safe content (for example spans/time), which may use block display. */
  readonly renderAnnotation?:
    | ((annotation: ExternalAnnotation) => ReactNode)
    | undefined;
};

export function createAnnotationExtension(
  read: () => readonly ExternalAnnotation[],
  mount: (id: string, container: HTMLElement) => void,
  unmount: (container: HTMLElement) => void,
) {
  return Extension.create({
    name: 'externalAnnotations',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            decorations(state) {
              return DecorationSet.create(
                state.doc,
                read().flatMap((annotation) => {
                  const position = positionForAnchor(
                    state.doc,
                    annotation.anchor,
                  );
                  return position === undefined
                    ? []
                    : [
                        Decoration.widget(
                          position,
                          () => {
                            const container = document.createElement('span');
                            container.dataset.scriptrAnnotation = annotation.id;
                            container.className = 'scriptr-external-annotation';
                            container.setAttribute('contenteditable', 'false');
                            mount(annotation.id, container);
                            return container;
                          },
                          {
                            key: annotation.id,
                            side: -1,
                            ignoreSelection: true,
                            stopEvent: () => true,
                            destroy: (node) => {
                              if (node instanceof HTMLElement) unmount(node);
                            },
                          },
                        ),
                      ];
                }),
              );
            },
          },
        }),
      ];
    },
  });
}
