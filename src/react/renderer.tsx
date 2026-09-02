import type { ReactNode } from 'react';

import type {
  Block,
  CanonicalDocument,
  InlineContent,
  ListItem,
  Mark,
  Reference,
} from '../document/types.js';
import type { ScriptureProvider } from '../host/scripture.js';
import { ScriptureBlockContent } from './scripture-blocks.js';

export type ScriptrRendererProps = {
  readonly document: CanonicalDocument;
  readonly className?: string | undefined;
  readonly onInternalDocumentLink?: ((targetId: string) => void) | undefined;
  readonly renderExtension?:
    | ((block: Extract<Block, { type: 'extension' }>) => ReactNode)
    | undefined;
  readonly scriptureProvider?: ScriptureProvider | undefined;
};

function referenceText(reference: Reference | undefined): string | undefined {
  return reference?.content
    .flatMap((block) => block.content.map((inline) => inline.text))
    .join(' ');
}

function applyMark(
  child: ReactNode,
  mark: Mark,
  key: string,
  references: CanonicalDocument['references'],
  onInternalDocumentLink: ScriptrRendererProps['onInternalDocumentLink'],
): ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong key={key}>{child}</strong>;
    case 'italic':
      return <em key={key}>{child}</em>;
    case 'underline':
      return <u key={key}>{child}</u>;
    case 'strikethrough':
      return <s key={key}>{child}</s>;
    case 'inlineCode':
      return <code key={key}>{child}</code>;
    case 'link':
      return (
        <a
          href={mark.href}
          key={key}
          rel="noopener noreferrer"
          title={mark.title}
        >
          {child}
        </a>
      );
    case 'internalDocumentLink':
      return (
        <a
          href={`#document-${encodeURIComponent(mark.targetId)}`}
          key={key}
          onClick={
            onInternalDocumentLink
              ? (event) => {
                  event.preventDefault();
                  onInternalDocumentLink(mark.targetId);
                }
              : undefined
          }
        >
          {child}
        </a>
      );
    case 'reference':
      return (
        <span
          className="scriptr-renderer__reference"
          data-reference-id={mark.referenceId}
          key={key}
          title={referenceText(references?.[mark.referenceId])}
        >
          {child}
        </span>
      );
  }
}

function renderInline(
  content: readonly InlineContent[],
  references: CanonicalDocument['references'],
  onInternalDocumentLink: ScriptrRendererProps['onInternalDocumentLink'],
) {
  return content.map((inline, index) => {
    if (inline.type === 'hardBreak') return <br key={`break-${index}`} />;
    let child: ReactNode = inline.text;
    for (const [markIndex, mark] of (inline.marks ?? []).entries()) {
      child = applyMark(
        child,
        mark,
        `mark-${index}-${markIndex}`,
        references,
        onInternalDocumentLink,
      );
    }
    return <span key={`inline-${index}`}>{child}</span>;
  });
}

function renderListItems(
  items: readonly ListItem[],
  kind: 'bullet' | 'numbered' | 'check',
  references: CanonicalDocument['references'],
  onInternalDocumentLink: ScriptrRendererProps['onInternalDocumentLink'],
): ReactNode {
  return items.map((item) => (
    <li
      data-checked={kind === 'check' ? item.checked : undefined}
      key={item.id}
    >
      {kind === 'check' ? (
        <input
          aria-label="Checklist item"
          checked={item.checked}
          disabled
          type="checkbox"
        />
      ) : null}
      <span>
        {renderInline(item.content, references, onInternalDocumentLink)}
      </span>
      {item.children?.length ? (
        kind === 'numbered' ? (
          <ol>
            {renderListItems(
              item.children,
              kind,
              references,
              onInternalDocumentLink,
            )}
          </ol>
        ) : (
          <ul data-type={kind === 'check' ? 'taskList' : undefined}>
            {renderListItems(
              item.children,
              kind,
              references,
              onInternalDocumentLink,
            )}
          </ul>
        )
      ) : null}
    </li>
  ));
}

function renderBlock(block: Block, props: ScriptrRendererProps): ReactNode {
  const inline = (content: readonly InlineContent[]) =>
    renderInline(
      content,
      props.document.references,
      props.onInternalDocumentLink,
    );
  switch (block.type) {
    case 'paragraph':
      return <p key={block.id}>{inline(block.content)}</p>;
    case 'heading': {
      const Tag = `h${block.level}` as const;
      return <Tag key={block.id}>{inline(block.content)}</Tag>;
    }
    case 'blockquote':
      return <blockquote key={block.id}>{inline(block.content)}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={block.id}>
          <code data-language={block.language}>{block.code}</code>
        </pre>
      );
    case 'callout':
      return (
        <aside
          className="scriptr-editor__callout"
          data-tone={block.tone}
          key={block.id}
        >
          {inline(block.content)}
        </aside>
      );
    case 'divider':
      return <hr key={block.id} />;
    case 'list':
      return block.kind === 'numbered' ? (
        <ol key={block.id} start={block.start}>
          {renderListItems(
            block.items,
            block.kind,
            props.document.references,
            props.onInternalDocumentLink,
          )}
        </ol>
      ) : (
        <ul
          data-type={block.kind === 'check' ? 'taskList' : undefined}
          key={block.id}
        >
          {renderListItems(
            block.items,
            block.kind,
            props.document.references,
            props.onInternalDocumentLink,
          )}
        </ul>
      );
    case 'scripture':
    case 'translationComparison':
      return (
        <ScriptureBlockContent
          block={block}
          key={block.id}
          provider={props.scriptureProvider}
        />
      );
    case 'image':
      return (
        <figure data-alignment={block.alignment} key={block.id}>
          {block.src ? (
            <img
              alt={block.alt}
              height={block.height}
              src={block.src}
              width={block.width}
            />
          ) : (
            <div
              aria-label={block.alt}
              className="scriptr-renderer__image-placeholder"
              role="img"
            />
          )}
          {block.caption?.length ? (
            <figcaption>{inline(block.caption)}</figcaption>
          ) : null}
        </figure>
      );
    case 'extension':
      return (
        props.renderExtension?.(block) ?? (
          <div
            className="scriptr-renderer__extension"
            data-extension={block.name}
            key={block.id}
          >
            This content requires the {block.name} extension.
          </div>
        )
      );
  }
}

export function ScriptrRenderer(props: ScriptrRendererProps) {
  return (
    <article
      className={['scriptr-renderer', props.className]
        .filter(Boolean)
        .join(' ')}
    >
      {props.document.content.map((block) => renderBlock(block, props))}
    </article>
  );
}
