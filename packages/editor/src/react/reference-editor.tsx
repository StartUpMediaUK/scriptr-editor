import type { JSONContent } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

import type {
  Mark,
  Reference,
  ReferenceContentBlock,
  TextInline,
} from '../document/types.js';

export type ReferenceEditorProps = {
  readonly reference: Reference;
  readonly onChange: (reference: Reference) => void;
  readonly className?: string | undefined;
};

function toEditorContent(reference: Reference): JSONContent {
  const inline = (item: TextInline): JSONContent => {
    const marks: NonNullable<JSONContent['marks']> = [];
    for (const mark of item.marks ?? []) {
      if (
        mark.type === 'bold' ||
        mark.type === 'italic' ||
        mark.type === 'underline'
      ) {
        marks.push({ type: mark.type });
      } else if (mark.type === 'link') {
        marks.push({
          type: 'link',
          attrs: mark.title
            ? { href: mark.href, title: mark.title }
            : { href: mark.href },
        });
      }
    }
    return {
      type: 'text',
      text: item.text,
      ...(marks.length ? { marks } : {}),
    };
  };
  return {
    type: 'doc',
    content: reference.content.map((block) =>
      block.type === 'listItem'
        ? {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: block.content.map(inline) },
                ],
              },
            ],
          }
        : { type: 'paragraph', content: block.content.map(inline) },
    ),
  };
}

function fromEditorContent(id: string, json: JSONContent): Reference {
  const convertParagraph = (
    node: JSONContent,
    type: ReferenceContentBlock['type'],
  ): ReferenceContentBlock => {
    const inline = (node.content ?? []).flatMap((item): TextInline[] => {
      if (item.type !== 'text' || !item.text) return [];
      const marks = item.marks?.flatMap((mark): Mark[] => {
        if (
          mark.type === 'bold' ||
          mark.type === 'italic' ||
          mark.type === 'underline'
        )
          return [{ type: mark.type }];
        if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
          return [
            typeof mark.attrs.title === 'string'
              ? { type: 'link', href: mark.attrs.href, title: mark.attrs.title }
              : { type: 'link', href: mark.attrs.href },
          ];
        }
        return [];
      });
      return [
        marks?.length
          ? { type: 'text', text: item.text, marks }
          : { type: 'text', text: item.text },
      ];
    });
    return { type, content: inline };
  };
  const convertNodes = (
    nodes: readonly JSONContent[],
  ): ReferenceContentBlock[] =>
    nodes.flatMap((node): ReferenceContentBlock[] => {
      if (node.type === 'paragraph')
        return [convertParagraph(node, 'paragraph')];
      if (node.type !== 'bulletList' && node.type !== 'orderedList') return [];
      return (node.content ?? []).flatMap((item) => {
        const paragraph = item.content?.find(
          (child) => child.type === 'paragraph',
        );
        const own = paragraph ? [convertParagraph(paragraph, 'listItem')] : [];
        const nested = (item.content ?? []).filter(
          (child) =>
            child.type === 'bulletList' || child.type === 'orderedList',
        );
        return [...own, ...convertNodes(nested)];
      });
    });
  const content = convertNodes(json.content ?? []);
  return {
    id,
    content: content.length ? content : [{ type: 'paragraph', content: [] }],
  };
}

export function ReferenceEditor({
  reference,
  onChange,
  className,
}: ReferenceEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    content: toEditorContent(reference),
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({ autolink: false, openOnClick: false }),
    ],
    editorProps: {
      attributes: {
        'aria-label': 'Reference annotation',
        class: 'scriptr-reference-editor__content',
      },
    },
    onUpdate({ editor: updatedEditor }) {
      onChange(fromEditorContent(reference.id, updatedEditor.getJSON()));
    },
  });

  if (!editor) return <div aria-busy="true" />;
  return (
    <section
      className={['scriptr-reference-editor', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        aria-label="Reference formatting"
        className="scriptr-reference-editor__toolbar"
      >
        <button
          aria-pressed={editor.isActive('bold')}
          onClick={() => void editor.chain().focus().toggleBold().run()}
          type="button"
        >
          B
        </button>
        <button
          aria-pressed={editor.isActive('italic')}
          onClick={() => void editor.chain().focus().toggleItalic().run()}
          type="button"
        >
          I
        </button>
        <button
          aria-pressed={editor.isActive('underline')}
          onClick={() => void editor.chain().focus().toggleUnderline().run()}
          type="button"
        >
          U
        </button>
        <button
          aria-pressed={editor.isActive('bulletList')}
          onClick={() => void editor.chain().focus().toggleBulletList().run()}
          type="button"
        >
          List
        </button>
        <button
          aria-pressed={editor.isActive('link')}
          onClick={() => {
            if (editor.isActive('link'))
              void editor.chain().focus().unsetLink().run();
            else {
              const href = window.prompt('Link URL');
              if (href) void editor.chain().focus().setLink({ href }).run();
            }
          }}
          type="button"
        >
          Link
        </button>
      </div>
      <EditorContent editor={editor} />
    </section>
  );
}
