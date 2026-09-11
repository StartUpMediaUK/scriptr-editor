import type { Editor, JSONContent } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  Bold,
  Italic,
  Link as LinkIcon,
  Underline as UnderlineIcon,
} from 'lucide-react';
import StarterKit from '@tiptap/starter-kit';
import { useState } from 'react';

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

function fromEditorContent(reference: Reference, json: JSONContent): Reference {
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
    id: reference.id,
    ...(reference.title ? { title: reference.title } : {}),
    content: content.length ? content : [{ type: 'paragraph', content: [] }],
  };
}

export function ReferenceEditor({
  reference,
  onChange,
  className,
}: ReferenceEditorProps) {
  const [slashQuery, setSlashQuery] = useState<string>();
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkHref, setLinkHref] = useState('');
  const updateSlashQuery = (currentEditor: Editor) => {
    const { $from } = currentEditor.state.selection;
    const match = /(?:^|\s)\/([^\s/]*)$/.exec(
      $from.parent.textBetween(0, $from.parentOffset),
    );
    setSlashQuery(match?.[1]?.toLowerCase());
  };
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
      Placeholder.configure({ placeholder: 'Add a description…' }),
    ],
    editorProps: {
      attributes: {
        'aria-label': 'Reference annotation',
        class: 'scriptr-reference-editor__content',
      },
    },
    onUpdate({ editor: updatedEditor }) {
      updateSlashQuery(updatedEditor);
      onChange(fromEditorContent(reference, updatedEditor.getJSON()));
    },
    onSelectionUpdate({ editor: updatedEditor }) {
      updateSlashQuery(updatedEditor);
    },
  });

  if (!editor) return <div aria-busy="true" />;
  return (
    <section
      className={['scriptr-reference-editor', className]
        .filter(Boolean)
        .join(' ')}
    >
      <BubbleMenu editor={editor} className="scriptr-reference-editor__toolbar">
        <button
          aria-label="Bold"
          aria-pressed={editor.isActive('bold')}
          onClick={() => void editor.chain().focus().toggleBold().run()}
          type="button"
        >
          <Bold aria-hidden="true" />
        </button>
        <button
          aria-label="Italic"
          aria-pressed={editor.isActive('italic')}
          onClick={() => void editor.chain().focus().toggleItalic().run()}
          type="button"
        >
          <Italic aria-hidden="true" />
        </button>
        <button
          aria-label="Underline"
          aria-pressed={editor.isActive('underline')}
          onClick={() => void editor.chain().focus().toggleUnderline().run()}
          type="button"
        >
          <UnderlineIcon aria-hidden="true" />
        </button>
        <button
          aria-label="Link"
          aria-pressed={editor.isActive('link')}
          onClick={() => {
            setLinkHref(String(editor.getAttributes('link').href ?? ''));
            setLinkEditorOpen((open) => !open);
          }}
          type="button"
        >
          <LinkIcon aria-hidden="true" />
        </button>
        {linkEditorOpen ? (
          <form
            className="scriptr-reference-editor__link"
            onSubmit={(event) => {
              event.preventDefault();
              const href = linkHref.trim();
              if (href) void editor.chain().focus().setLink({ href }).run();
              else void editor.chain().focus().unsetLink().run();
              setLinkEditorOpen(false);
            }}
          >
            <input
              aria-label="Link URL"
              autoFocus
              onChange={(event) => setLinkHref(event.currentTarget.value)}
              placeholder="https://…"
              type="url"
              value={linkHref}
            />
            <button type="submit">Apply</button>
          </form>
        ) : null}
      </BubbleMenu>
      <EditorContent editor={editor} />
      {slashQuery !== undefined ? (
        <div
          className="scriptr-reference-editor__slash"
          role="menu"
          aria-label="Reference formatting commands"
        >
          {[
            {
              id: 'bold',
              label: 'Bold',
              run: () => editor.chain().focus().toggleBold(),
            },
            {
              id: 'italic',
              label: 'Italic',
              run: () => editor.chain().focus().toggleItalic(),
            },
            {
              id: 'underline',
              label: 'Underline',
              run: () => editor.chain().focus().toggleUnderline(),
            },
            {
              id: 'list',
              label: 'Bulleted list',
              run: () => editor.chain().focus().toggleBulletList(),
            },
          ]
            .filter((item) => item.label.toLowerCase().includes(slashQuery))
            .map((item) => (
              <button
                key={item.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  const { from } = editor.state.selection;
                  void item
                    .run()
                    .deleteRange({
                      from: from - slashQuery.length - 1,
                      to: from,
                    })
                    .run();
                  setSlashQuery(undefined);
                }}
                role="menuitem"
                type="button"
              >
                {item.label}
              </button>
            ))}
        </div>
      ) : null}
    </section>
  );
}
