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
import { createImageNodeViewRenderer } from './image-block.js';
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
  inclusive: false,
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
];

export function createEditorExtensions(
  placeholder: string,
  scriptureProvider?: ScriptureProvider,
  imageHost?: ImageHost,
  extensions: readonly ReactExtensionRenderer[] = [],
) {
  return [
    StarterKit.configure({
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
    Callout,
    createPortableBlock(extensions),
    createScriptureBlockNode(scriptureProvider),
    createImageBlockNode(imageHost),
    InternalDocumentLink,
    ReferenceAnchor,
    UniqueID.configure({ types: idTypes }),
    Placeholder.configure({ placeholder }),
  ];
}
