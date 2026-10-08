import {
  annotationsForRegion,
  renderAnnotatedContent,
} from './annotation-content.js';
import { Component, Fragment } from 'react';
import type { ExternalAnnotationProps } from './annotations.js';
import type { DocumentAnchor } from '../document/anchors.js';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import type {
  Block,
  CanonicalDocument,
  InlineContent,
  ListItem,
  Mark,
  Reference,
  ExtensionBlock,
  JsonValue,
} from '../document/types.js';
import { isSafeExternalUrl } from '../document/external-links.js';
import type { ScriptureProvider } from '../host/scripture.js';
import type { ImageHost } from '../host/images.js';
import type { MediaHost } from '../host/media.js';
import type { DocumentTargetProvider } from '../host/documents.js';
import { ScriptureBlockContent } from './scripture-blocks.js';
import { ImageBlockContent } from './image-block.js';
import { BookmarkBlockContent } from './bookmark-block.js';
import { MediaBlockContent } from './media-block.js';

export type ScriptrRendererProps = ExternalAnnotationProps & {
  readonly document: CanonicalDocument;
  readonly className?: string | undefined;
  readonly onInternalDocumentLink?: ((targetId: string) => void) | undefined;
  readonly onReferenceOpen?:
    | ((reference: Reference, referenceId: string) => void)
    | undefined;
  readonly renderExtension?:
    | ((block: Extract<Block, { type: 'extension' }>) => ReactNode)
    | undefined;
  readonly scriptureProvider?: ScriptureProvider | undefined;
  readonly documentTargetProvider?: DocumentTargetProvider | undefined;
  readonly imageHost?: ImageHost | undefined;
  readonly mediaHost?: MediaHost | undefined;
  readonly extensions?: readonly ReactExtensionRenderer[] | undefined;
  readonly onRenderError?:
    | ((error: Error, block: ExtensionBlock) => void)
    | undefined;
};

export type ReactExtensionRenderer = {
  readonly name: string;
  readonly version: number;
  readonly parseData: (input: unknown) => JsonValue;
  readonly renderReadonly: (
    data: JsonValue,
    context: { readonly locale?: string | undefined },
  ) => ReactNode;
  readonly renderEditable?:
    | ((
        data: JsonValue,
        context: { readonly locale?: string | undefined },
      ) => ReactNode)
    | undefined;
  readonly slashItems?: readonly ReactExtensionSlashItem[] | undefined;
};

export type ReactExtensionSlashItem = {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly notation?: string | undefined;
  readonly keywords?: string | undefined;
  readonly createBlock: () => ExtensionBlock;
};

export type ReactExtensionDefinition<TData extends JsonValue> = {
  readonly name: string;
  readonly version: number;
  readonly parseData: (input: unknown) => TData;
  readonly renderReadonly: (
    data: TData,
    context: { readonly locale?: string | undefined },
  ) => ReactNode;
  readonly renderEditable?:
    | ((
        data: TData,
        context: { readonly locale?: string | undefined },
      ) => ReactNode)
    | undefined;
  readonly slashItems?: readonly ReactExtensionSlashItem[] | undefined;
};

export function defineReactExtension<TData extends JsonValue>(
  definition: ReactExtensionDefinition<TData>,
): ReactExtensionRenderer {
  const renderEditable = definition.renderEditable;
  return {
    name: definition.name,
    version: definition.version,
    parseData: definition.parseData,
    renderReadonly: (data, context) =>
      definition.renderReadonly(definition.parseData(data), context),
    ...(renderEditable
      ? {
          renderEditable: (
            data: JsonValue,
            context: { readonly locale?: string | undefined },
          ) => renderEditable(definition.parseData(data), context),
        }
      : {}),
    ...(definition.slashItems ? { slashItems: definition.slashItems } : {}),
  };
}

class ExtensionErrorBoundary extends Component<
  {
    readonly block: ExtensionBlock;
    readonly onError?:
      | ((error: Error, block: ExtensionBlock) => void)
      | undefined;
    readonly children: ReactNode;
  },
  { readonly failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    this.props.onError?.(error, this.props.block);
  }
  override render() {
    return this.state.failed ? (
      <div
        className="scriptr-renderer__extension"
        data-extension={this.props.block.name}
      >
        This content could not be displayed.
      </div>
    ) : (
      this.props.children
    );
  }
}

function ExtensionOutput({
  block,
  extension,
}: {
  readonly block: ExtensionBlock;
  readonly extension: ReactExtensionRenderer;
}) {
  if (block.version !== extension.version)
    throw new Error(
      `Unsupported ${block.name} extension version ${block.version}.`,
    );
  return extension.renderReadonly(extension.parseData(block.data), {});
}

function ResolvedInternalLink({
  targetId,
  provider,
  onNavigate,
  children,
}: {
  readonly targetId: string;
  readonly provider?: DocumentTargetProvider | undefined;
  readonly onNavigate: ScriptrRendererProps['onInternalDocumentLink'];
  readonly children: ReactNode;
}) {
  const [available, setAvailable] = useState<boolean>();
  useEffect(() => {
    if (!provider) return;
    const controller = new AbortController();
    void provider.resolve(targetId, controller.signal).then(
      (target) => setAvailable(Boolean(target)),
      () => {
        if (!controller.signal.aborted) setAvailable(false);
      },
    );
    return () => controller.abort();
  }, [provider, targetId]);
  return (
    <a
      aria-disabled={available === false || undefined}
      data-target-state={
        provider
          ? available === undefined
            ? 'loading'
            : available
              ? 'ready'
              : 'unavailable'
          : undefined
      }
      href={`#document-${encodeURIComponent(targetId)}`}
      onClick={(event) => {
        if (!onNavigate || available === false) return;
        event.preventDefault();
        onNavigate(targetId);
      }}
    >
      {children}
    </a>
  );
}

function referenceText(reference: Reference | undefined): string | undefined {
  const content = reference?.content
    .flatMap((block) => block.content.map((inline) => inline.text))
    .join(' ');
  return [reference?.title, content].filter(Boolean).join(' — ') || undefined;
}

function applyMark(
  child: ReactNode,
  mark: Mark,
  key: string,
  references: CanonicalDocument['references'],
  onInternalDocumentLink: ScriptrRendererProps['onInternalDocumentLink'],
  documentTargetProvider: ScriptrRendererProps['documentTargetProvider'],
  onReferenceOpen: ScriptrRendererProps['onReferenceOpen'],
): ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong key={key}>{child}</strong>;
    case 'accent':
      return (
        <span className="scriptr-renderer__accent" key={key}>
          {child}
        </span>
      );
    case 'italic':
      return <em key={key}>{child}</em>;
    case 'underline':
      return <u key={key}>{child}</u>;
    case 'strikethrough':
      return <s key={key}>{child}</s>;
    case 'inlineCode':
      return <code key={key}>{child}</code>;
    case 'textColour':
      return (
        <span
          data-scriptr-text-colour=""
          key={key}
          style={{ color: mark.colour }}
        >
          {child}
        </span>
      );
    case 'highlightColour':
      return (
        <mark
          data-scriptr-highlight-colour=""
          key={key}
          style={{ backgroundColor: mark.colour }}
        >
          {child}
        </mark>
      );
    case 'link':
      return isSafeExternalUrl(mark.href) ? (
        <a
          href={mark.href}
          key={key}
          rel="noopener noreferrer"
          title={mark.title}
        >
          {child}
        </a>
      ) : (
        <span data-link-state="unsafe" key={key}>
          {child}
        </span>
      );
    case 'internalDocumentLink':
      return (
        <ResolvedInternalLink
          key={key}
          onNavigate={onInternalDocumentLink}
          provider={documentTargetProvider}
          targetId={mark.targetId}
        >
          {child}
        </ResolvedInternalLink>
      );
    case 'reference': {
      const reference = references?.[mark.referenceId];
      return onReferenceOpen && reference ? (
        <button
          className="scriptr-renderer__reference"
          data-reference-id={mark.referenceId}
          key={key}
          onClick={() => onReferenceOpen(reference, mark.referenceId)}
          title={referenceText(reference)}
          type="button"
        >
          {child}
        </button>
      ) : (
        <span
          className="scriptr-renderer__reference"
          data-reference-id={mark.referenceId}
          data-reference-state={reference ? 'ready' : 'unavailable'}
          key={key}
          title={referenceText(reference)}
        >
          {child}
        </span>
      );
    }
  }
}

function renderInline(
  content: readonly InlineContent[],
  references: CanonicalDocument['references'],
  onInternalDocumentLink: ScriptrRendererProps['onInternalDocumentLink'],
  documentTargetProvider: ScriptrRendererProps['documentTargetProvider'],
  onReferenceOpen: ScriptrRendererProps['onReferenceOpen'],
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
        documentTargetProvider,
        onReferenceOpen,
      );
    }
    return <span key={`inline-${index}`}>{child}</span>;
  });
}

function renderAnnotatedInline(
  content: readonly InlineContent[],
  props: ScriptrRendererProps,
  region: Pick<DocumentAnchor, 'blockId' | 'itemId' | 'field'>,
): ReactNode {
  return renderAnnotatedContent(content, region, props, (values) =>
    renderInline(
      values,
      props.document.references,
      props.onInternalDocumentLink,
      props.documentTargetProvider,
      props.onReferenceOpen,
    ),
  );
}

function renderListItems(
  items: readonly ListItem[],
  kind: 'bullet' | 'numbered' | 'check',
  references: CanonicalDocument['references'],
  onInternalDocumentLink: ScriptrRendererProps['onInternalDocumentLink'],
  documentTargetProvider: ScriptrRendererProps['documentTargetProvider'],
  onReferenceOpen: ScriptrRendererProps['onReferenceOpen'],
  annotationContext?: {
    readonly props: ScriptrRendererProps;
    readonly blockId: string;
  },
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
        {annotationContext
          ? renderAnnotatedInline(item.content, annotationContext.props, {
              blockId: annotationContext.blockId,
              itemId: item.id,
              field: 'content',
            })
          : renderInline(
              item.content,
              references,
              onInternalDocumentLink,
              documentTargetProvider,
              onReferenceOpen,
            )}
      </span>
      {item.children?.length ? (
        kind === 'numbered' ? (
          <ol>
            {renderListItems(
              item.children,
              kind,
              references,
              onInternalDocumentLink,
              documentTargetProvider,
              onReferenceOpen,
              annotationContext,
            )}
          </ol>
        ) : (
          <ul data-type={kind === 'check' ? 'taskList' : undefined}>
            {renderListItems(
              item.children,
              kind,
              references,
              onInternalDocumentLink,
              documentTargetProvider,
              onReferenceOpen,
              annotationContext,
            )}
          </ul>
        )
      ) : null}
    </li>
  ));
}

function renderBlockBase(block: Block, props: ScriptrRendererProps): ReactNode {
  const inline = (
    content: readonly InlineContent[],
    field: DocumentAnchor['field'] = 'content',
  ) => renderAnnotatedInline(content, props, { blockId: block.id, field });
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
        <pre className="native-scrollbar" key={block.id}>
          <code data-language={block.language}>
            {inline([{ type: 'text', text: block.code }], 'code')}
          </code>
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
            props.documentTargetProvider,
            props.onReferenceOpen,
            { props, blockId: block.id },
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
            props.documentTargetProvider,
            props.onReferenceOpen,
            { props, blockId: block.id },
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
        <ImageBlockContent
          block={block}
          captionContent={
            block.caption ||
            annotationsForRegion(
              { blockId: block.id, field: 'caption' },
              0,
              props,
            ).length
              ? inline(block.caption ?? [], 'caption')
              : undefined
          }
          imageHost={props.imageHost}
          key={block.id}
        />
      );
    case 'video':
    case 'audio':
      return (
        <MediaBlockContent
          block={block}
          captionContent={
            (block.type === 'video' ? block.caption : block.transcript) ||
            annotationsForRegion(
              {
                blockId: block.id,
                field: block.type === 'video' ? 'caption' : 'transcript',
              },
              0,
              props,
            ).length
              ? inline(
                  block.type === 'video'
                    ? (block.caption ?? [])
                    : (block.transcript ?? []),
                  block.type === 'video' ? 'caption' : 'transcript',
                )
              : undefined
          }
          key={block.id}
          mediaHost={props.mediaHost}
        />
      );
    case 'webBookmark':
      return (
        <BookmarkBlockContent
          block={block}
          key={block.id}
          mediaHost={props.mediaHost}
        />
      );
    case 'columns':
      return (
        <section
          className="scriptr-renderer__columns"
          data-scriptr-columns=""
          key={block.id}
        >
          {block.columns.map((column) => (
            <div data-scriptr-column="" key={column.id}>
              {column.content.map((child) => renderBlock(child, props))}
            </div>
          ))}
        </section>
      );
    case 'toggle':
      return (
        <details
          className="scriptr-renderer__toggle"
          data-heading-level={block.headingLevel}
          data-scriptr-toggle=""
          key={block.id}
          open={block.defaultOpen}
        >
          <summary data-scriptr-toggle-summary="">
            {block.headingLevel ? (
              <span aria-level={block.headingLevel} role="heading">
                {inline(block.summary, 'summary')}
              </span>
            ) : (
              inline(block.summary, 'summary')
            )}
          </summary>
          <div data-scriptr-toggle-content="">
            {block.content.map((child) => renderBlock(child, props))}
          </div>
        </details>
      );
    case 'extension': {
      const extension = props.extensions?.find(
        (item) => item.name === block.name,
      );
      return (
        <ExtensionErrorBoundary
          block={block}
          key={block.id}
          onError={props.onRenderError}
        >
          {extension ? (
            <ExtensionOutput block={block} extension={extension} />
          ) : (
            (props.renderExtension?.(block) ?? (
              <div
                className="scriptr-renderer__extension"
                data-extension={block.name}
                key={block.id}
              >
                This content requires the {block.name} extension.
              </div>
            ))
          )}
        </ExtensionErrorBoundary>
      );
    }
  }
}

function renderBlock(block: Block, props: ScriptrRendererProps): ReactNode {
  const content = renderBlockBase(block, props);
  const rendered = block.background ? (
    <div
      className="scriptr-renderer__block-background"
      data-scriptr-background={block.background}
      key={block.id}
    >
      {content}
    </div>
  ) : (
    content
  );
  const annotations = props.renderAnnotation
    ? (props.annotations ?? []).filter(
        (annotation) =>
          annotation.anchor.field === 'block' &&
          annotation.anchor.blockId === block.id &&
          annotation.anchor.itemId === undefined &&
          annotation.anchor.offset === 0 &&
          annotation.anchor.length === 0,
      )
    : [];
  return annotations.length ? (
    <Fragment key={block.id}>
      {annotations.map((annotation) => (
        <span
          className="scriptr-external-annotation"
          data-scriptr-annotation={annotation.id}
          key={annotation.id}
        >
          {props.renderAnnotation?.(annotation)}
        </span>
      ))}
      {rendered}
    </Fragment>
  ) : (
    rendered
  );
}

export function ScriptrRenderer(props: ScriptrRendererProps) {
  return (
    <article
      className={['scriptr-renderer', props.className]
        .filter(Boolean)
        .join(' ')}
      dir="auto"
    >
      {props.document.content.map((block) => renderBlock(block, props))}
    </article>
  );
}
