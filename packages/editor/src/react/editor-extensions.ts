import { Mark, mergeAttributes, Node } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Underline from '@tiptap/extension-underline';
import UniqueID from '@tiptap/extension-unique-id';
import StarterKit from '@tiptap/starter-kit';
import type { ScriptureProvider } from '../host/scripture.js';
import type { ImageHost } from '../host/images.js';
import type { MediaHost } from '../host/media.js';
import { createBookmarkNodeViewRenderer } from './bookmark-block.js';
import { createImageNodeViewRenderer } from './image-block.js';
import { createMediaNodeViewRenderer } from './media-block.js';
import { createExtensionNodeViewRenderer } from './extension-block.js';
import type { ReactExtensionRenderer } from './renderer.js';
import { createScriptureNodeViewRenderer } from './scripture-blocks.js';

const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  draggable: true,
  defining: true,
  addAttributes() {
    return {
      id: { default: null },
      tone: { default: 'note' },
    };
  },
  parseHTML() {
    return [{ tag: 'aside[data-scriptr-callout]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'aside',
      mergeAttributes(HTMLAttributes, {
        'data-scriptr-callout': '',
        class: 'scriptr-editor__callout',
      }),
      0,
    ];
  },
});

const createPortableBlock = (extensions: readonly ReactExtensionRenderer[]) =>
  Node.create({
    name: 'portableBlock',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        id: { default: null },
        blockType: { default: 'extension' },
        payload: { default: '{}' },
      };
    },
    parseHTML() {
      return [{ tag: 'div[data-scriptr-portable-block]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, {
          'data-scriptr-portable-block': '',
          class: 'scriptr-editor__portable-block',
        }),
      ];
    },
    addNodeView() {
      return createExtensionNodeViewRenderer(extensions);
    },
  });

const createScriptureBlockNode = (provider: ScriptureProvider | undefined) =>
  Node.create({
    name: 'scriptureBlock',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        id: { default: null },
        blockType: { default: 'scripture' },
        payload: { default: '{}' },
      };
    },
    parseHTML() {
      return [{ tag: 'div[data-scriptr-scripture-block]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, {
          'data-scriptr-scripture-block': '',
        }),
      ];
    },
    addNodeView() {
      return createScriptureNodeViewRenderer(provider);
    },
  });

const createImageBlockNode = (imageHost: ImageHost | undefined) =>
  Node.create({
    name: 'imageBlock',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        id: { default: null },
        blockType: { default: 'image' },
        payload: { default: '{}' },
      };
    },
    parseHTML() {
      return [{ tag: 'div[data-scriptr-image-block]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, { 'data-scriptr-image-block': '' }),
      ];
    },
    addNodeView() {
      return createImageNodeViewRenderer(imageHost);
    },
  });

const createMediaBlockNode = (mediaHost: MediaHost | undefined) =>
  Node.create({
    name: 'mediaBlock',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        id: { default: null },
        blockType: { default: 'video' },
        payload: { default: '{}' },
      };
    },
    parseHTML() {
      return [{ tag: 'div[data-scriptr-media-block]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, { 'data-scriptr-media-block': '' }),
      ];
    },
    addNodeView() {
      return createMediaNodeViewRenderer(mediaHost);
    },
  });

const createBookmarkBlockNode = (mediaHost: MediaHost | undefined) =>
  Node.create({
    name: 'bookmarkBlock',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        id: { default: null },
        blockType: { default: 'webBookmark' },
        payload: { default: '{}' },
      };
    },
    parseHTML() {
      return [{ tag: 'div[data-scriptr-bookmark-block]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, { 'data-scriptr-bookmark-block': '' }),
      ];
    },
    addNodeView() {
      return createBookmarkNodeViewRenderer(mediaHost);
    },
  });

const InternalDocumentLink = Mark.create({
  name: 'internalDocumentLink',
  inclusive: false,
  addAttributes() {
    return { targetId: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'a[data-scriptr-document-link]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-scriptr-document-link': '',
        class: 'scriptr-editor__internal-link',
      }),
      0,
    ];
  },
});

const ReferenceAnchor = Mark.create({
  name: 'referenceAnchor',
  inclusive: true,
  addAttributes() {
    return { referenceId: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'span[data-scriptr-reference]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-scriptr-reference': '',
        class: 'scriptr-editor__reference-anchor',
      }),
      0,
    ];
  },
  addKeyboardShortcuts() {
    const endReference = () => {
      if (!this.editor.isActive(this.name)) return false;
      this.editor.commands.unsetMark(this.name);
      return false;
    };
    return {
      Enter: endReference,
      '.': endReference,
      ',': endReference,
      ';': endReference,
      ':': endReference,
      '!': endReference,
      '?': endReference,
      ' ': () => {
        const { $from } = this.editor.state.selection;
        return $from.parent.textBetween(0, $from.parentOffset).endsWith(' ')
          ? endReference()
          : false;
      },
    };
  },
});

const Accent = Mark.create({
  name: 'accent',
  parseHTML() {
    return [{ tag: 'span[data-scriptr-accent]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-scriptr-accent': '',
        class: 'scriptr-editor__accent',
      }),
      0,
    ];
  },
});

const TextColour = Mark.create({
  name: 'textColour',
  addAttributes() {
    return { colour: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'span[data-scriptr-text-colour]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-scriptr-text-colour': '',
        style: `color: ${String(HTMLAttributes.colour)}`,
      }),
      0,
    ];
  },
});

const HighlightColour = Mark.create({
  name: 'highlightColour',
  addAttributes() {
    return { colour: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'mark[data-scriptr-highlight-colour]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'mark',
      mergeAttributes(HTMLAttributes, {
        'data-scriptr-highlight-colour': '',
        style: `background-color: ${String(HTMLAttributes.colour)}`,
      }),
      0,
    ];
  },
});

const ColumnLayout = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,4}',
  draggable: true,
  defining: true,
  addAttributes() {
    return { id: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'section[data-scriptr-columns]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'data-scriptr-columns': '',
        class: 'scriptr-editor__columns',
      }),
      0,
    ];
  },
});

const Column = Node.create({
  name: 'column',
  content: 'block+',
  defining: true,
  addAttributes() {
    return { id: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'div[data-scriptr-column]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-scriptr-column': '',
        class: 'scriptr-editor__column',
      }),
      0,
    ];
  },
});

const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'toggleSummary toggleContent',
  draggable: true,
  defining: true,
  addAttributes() {
    return {
      id: { default: null },
      headingLevel: { default: null },
      defaultOpen: { default: false },
    };
  },
  parseHTML() {
    return [{ tag: 'details[data-scriptr-toggle]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const { defaultOpen, headingLevel, ...attributes } = HTMLAttributes;
    return [
      'details',
      mergeAttributes(attributes, {
        'data-scriptr-toggle': '',
        ...(headingLevel ? { 'data-heading-level': String(headingLevel) } : {}),
        ...(defaultOpen ? { open: '' } : {}),
        class: 'scriptr-editor__toggle',
      }),
      0,
    ];
  },
  addNodeView() {
    return ({ editor, getPos, node }) => {
      let currentNode = node;
      const dom = document.createElement('details');
      dom.className = 'scriptr-editor__toggle';
      dom.dataset.scriptrToggle = '';

      const syncAttributes = () => {
        const headingLevel: unknown = currentNode.attrs.headingLevel;
        if (headingLevel === 1 || headingLevel === 2 || headingLevel === 3) {
          dom.dataset.headingLevel = String(headingLevel);
        } else {
          delete dom.dataset.headingLevel;
        }
        dom.open = currentNode.attrs.defaultOpen === true;
      };

      const persistOpenState = () => {
        if (!editor.isEditable || currentNode.attrs.defaultOpen === dom.open)
          return;
        const position = getPos();
        if (typeof position !== 'number') return;
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(position, undefined, {
            ...currentNode.attrs,
            defaultOpen: dom.open,
          }),
        );
      };

      const toggleFromSummary = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest('summary')) return;
        const nextOpen = !dom.open;
        event.preventDefault();
        globalThis.setTimeout(() => {
          dom.open = nextOpen;
          persistOpenState();
        }, 0);
      };

      dom.addEventListener('toggle', persistOpenState);
      dom.addEventListener('click', toggleFromSummary, true);
      syncAttributes();

      return {
        dom,
        contentDOM: dom,
        update(updatedNode) {
          if (updatedNode.type !== currentNode.type) return false;
          currentNode = updatedNode;
          syncAttributes();
          return true;
        },
        destroy() {
          dom.removeEventListener('toggle', persistOpenState);
          dom.removeEventListener('click', toggleFromSummary, true);
        },
      };
    };
  },
});

const ToggleSummary = Node.create({
  name: 'toggleSummary',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'summary[data-scriptr-toggle-summary]' }];
  },
  renderHTML() {
    return [
      'summary',
      {
        'data-scriptr-toggle-summary': '',
        class: 'scriptr-editor__toggle-summary',
      },
      0,
    ];
  },
});

const ToggleContent = Node.create({
  name: 'toggleContent',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-scriptr-toggle-content]' }];
  },
  renderHTML() {
    return [
      'div',
      {
        'data-scriptr-toggle-content': '',
        class: 'scriptr-editor__toggle-content',
      },
      0,
    ];
  },
});

const idTypes = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'bulletList',
  'orderedList',
  'taskList',
  'listItem',
  'taskItem',
  'callout',
  'portableBlock',
  'scriptureBlock',
  'imageBlock',
  'mediaBlock',
  'bookmarkBlock',
  'columns',
  'column',
  'toggle',
];

export function createEditorExtensions(
  placeholder: string,
  scriptureProvider?: ScriptureProvider,
  imageHost?: ImageHost,
  mediaHost?: MediaHost,
  extensions: readonly ReactExtensionRenderer[] = [],
) {
  return [
    StarterKit.configure({
      codeBlock: { HTMLAttributes: { class: 'native-scrollbar' } },
      link: false,
      underline: false,
      trailingNode: false,
    }),
    Underline,
    Link.configure({
      autolink: false,
      openOnClick: false,
      HTMLAttributes: { rel: 'noopener noreferrer' },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    ColumnLayout,
    Column,
    Toggle,
    ToggleSummary,
    ToggleContent,
    Callout,
    createPortableBlock(extensions),
    createScriptureBlockNode(scriptureProvider),
    createImageBlockNode(imageHost),
    createMediaBlockNode(mediaHost),
    createBookmarkBlockNode(mediaHost),
    InternalDocumentLink,
    ReferenceAnchor,
    Accent,
    TextColour,
    HighlightColour,
    UniqueID.configure({ types: idTypes }),
    Placeholder.configure({ placeholder }),
  ];
}
