import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { ExternalLink, Globe2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { createDocumentCodec } from '../document/codec.js';
import type { WebBookmarkBlock } from '../document/types.js';
import type { BookmarkProvider } from '../host/bookmarks.js';
import type { MediaHost } from '../host/media.js';

function normalizeBookmarkUrl(value: string) {
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export type BookmarkBlockContentProps = {
  readonly block: WebBookmarkBlock;
  readonly mediaHost?: MediaHost | undefined;
  readonly editable?: boolean | undefined;
  readonly onRemove?: (() => void) | undefined;
};

export function BookmarkBlockContent({
  block,
  mediaHost,
  editable = false,
  onRemove,
}: BookmarkBlockContentProps) {
  const [imageSource, setImageSource] = useState<string>();
  useEffect(() => {
    if (!block.imageAssetId || !mediaHost) return;
    const controller = new AbortController();
    void mediaHost.resolve(block.imageAssetId, controller.signal).then(
      (image) => {
        if (image?.kind === 'image') setImageSource(image.src);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [block.imageAssetId, mediaHost]);

  return (
    <article className="scriptr-bookmark">
      <a href={block.url} rel="noreferrer noopener" target="_blank">
        {imageSource ? <img alt="" src={imageSource} /> : null}
        <span className="scriptr-bookmark__body">
          <span className="scriptr-bookmark__site">
            <Globe2 />
            {block.siteName ?? new URL(block.url).hostname}
          </span>
          <strong>{block.title}</strong>
          {block.description ? <span>{block.description}</span> : null}
        </span>
        <ExternalLink aria-hidden="true" />
      </a>
      {editable ? (
        <Button onClick={onRemove} size="sm" type="button" variant="ghost">
          <Trash2 data-icon="inline-start" />
          Remove bookmark
        </Button>
      ) : null}
    </article>
  );
}

export type BookmarkComposerProps = {
  readonly provider: BookmarkProvider;
  readonly createBlockId: () => string;
  readonly onAdd: (block: WebBookmarkBlock) => void;
  readonly onCancel: () => void;
};

export function BookmarkComposer({
  provider,
  createBlockId,
  onAdd,
  onCancel,
}: BookmarkComposerProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const normalized = normalizeBookmarkUrl(url);
  useEffect(() => () => controllerRef.current?.abort(), []);

  return (
    <form
      className="scriptr-bookmark-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!normalized) return;
        const controller = new AbortController();
        controllerRef.current?.abort();
        controllerRef.current = controller;
        setLoading(true);
        setError(undefined);
        void (async () => {
          try {
            const metadata = await provider.resolve(
              normalized,
              controller.signal,
            );
            const resolvedUrl = normalizeBookmarkUrl(metadata.url);
            if (!resolvedUrl)
              throw new Error('The bookmark provider returned an invalid URL.');
            if (!metadata.title.trim())
              throw new Error('The bookmark provider returned an empty title.');
            onAdd({
              id: createBlockId(),
              type: 'webBookmark',
              url: resolvedUrl,
              title: metadata.title,
              description: metadata.description,
              siteName: metadata.siteName,
              imageAssetId: metadata.imageAssetId,
            });
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : 'Could not load this bookmark.',
            );
            setLoading(false);
          }
        })();
      }}
    >
      <Input
        aria-invalid={url.length > 0 && !normalized ? true : undefined}
        aria-label="Bookmark URL"
        autoFocus
        inputMode="url"
        onChange={(event) => setUrl(event.currentTarget.value)}
        placeholder="example.com/article"
        value={url}
      />
      {error ? <p role="alert">{error}</p> : null}
      <div className="scriptr-bookmark-composer__actions">
        <Button
          onClick={() => {
            controllerRef.current?.abort();
            onCancel();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button disabled={!normalized || loading} size="sm" type="submit">
          {loading ? 'Loading…' : 'Add bookmark'}
        </Button>
      </div>
    </form>
  );
}

function BookmarkNodeView({
  node,
  deleteNode,
  editor,
  mediaHost,
}: NodeViewProps & { readonly mediaHost?: MediaHost | undefined }) {
  const parsed = createDocumentCodec().parse({
    version: 2,
    content: [JSON.parse(String(node.attrs.payload))],
  }).content[0];
  if (!parsed || parsed.type !== 'webBookmark')
    return <NodeViewWrapper>Invalid bookmark block.</NodeViewWrapper>;
  return (
    <NodeViewWrapper>
      <BookmarkBlockContent
        block={parsed}
        editable={editor.isEditable}
        mediaHost={mediaHost}
        onRemove={deleteNode}
      />
    </NodeViewWrapper>
  );
}

export const createBookmarkNodeViewRenderer = (
  mediaHost: MediaHost | undefined,
) =>
  ReactNodeViewRenderer((props) => (
    <BookmarkNodeView {...props} mediaHost={mediaHost} />
  ));
