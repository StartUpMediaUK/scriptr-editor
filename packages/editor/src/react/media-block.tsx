import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { AudioLines, Trash2, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../components/ui/button.js';
import { Field, FieldLabel } from '../components/ui/field.js';
import { Input } from '../components/ui/input.js';
import { createDocumentCodec } from '../document/codec.js';
import type { AudioBlock, VideoBlock } from '../document/types.js';
import type { HostedMedia, MediaHost, MediaKind } from '../host/media.js';

type AuthoredMediaBlock = VideoBlock | AudioBlock;

function safeMediaSource(source: string | undefined) {
  if (!source) return undefined;
  try {
    const url = new URL(source);
    return ['https:', 'http:', 'blob:'].includes(url.protocol)
      ? source
      : undefined;
  } catch {
    return undefined;
  }
}

const inlineText = (content: VideoBlock['caption']) =>
  content?.map((item) => (item.type === 'text' ? item.text : '\n')).join('') ??
  '';

export type MediaBlockContentProps = {
  readonly block: AuthoredMediaBlock;
  readonly mediaHost?: MediaHost | undefined;
  readonly editable?: boolean | undefined;
  readonly onChange?: ((block: AuthoredMediaBlock) => void) | undefined;
  readonly onRemove?: (() => void) | undefined;
};

export function MediaBlockContent({
  block,
  mediaHost,
  editable = false,
  onChange,
  onRemove,
}: MediaBlockContentProps) {
  const [resolved, setResolved] = useState<HostedMedia>();
  const [posterSource, setPosterSource] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const posterAssetId =
    block.type === 'video' ? block.posterAssetId : undefined;
  useEffect(() => {
    if (block.src || !block.assetId || !mediaHost) return;
    const controller = new AbortController();
    void mediaHost.resolve(block.assetId, controller.signal).then(
      (media) => {
        setResolved(media?.kind === block.type ? media : undefined);
        setUnavailable(media?.kind !== block.type);
      },
      () => {
        if (!controller.signal.aborted) setUnavailable(true);
      },
    );
    return () => controller.abort();
  }, [block.assetId, block.src, block.type, mediaHost]);
  useEffect(() => {
    if (!posterAssetId || !mediaHost) return;
    const controller = new AbortController();
    void mediaHost.resolve(posterAssetId, controller.signal).then(
      (poster) => {
        if (poster?.kind === 'image')
          setPosterSource(safeMediaSource(poster.src));
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [mediaHost, posterAssetId]);

  const source = safeMediaSource(block.src ?? resolved?.src);
  const status =
    unavailable || (!source && !mediaHost) ? 'unavailable' : 'loading';
  const title = block.title;

  return (
    <figure className="scriptr-media" data-media-kind={block.type}>
      {source ? (
        block.type === 'video' ? (
          <video
            aria-label={title ?? 'Video'}
            controls
            height={block.height ?? resolved?.height}
            playsInline
            poster={posterSource}
            preload="metadata"
            src={source}
            width={block.width ?? resolved?.width}
          />
        ) : (
          <audio aria-label={title} controls preload="metadata" src={source} />
        )
      ) : (
        <div className="scriptr-media__placeholder" role="status">
          {block.type === 'video' ? <Video /> : <AudioLines />}
          {status === 'unavailable'
            ? `${block.type === 'video' ? 'Video' : 'Audio'} unavailable`
            : `Loading ${block.type}…`}
        </div>
      )}
      {title ? <strong className="scriptr-media__title">{title}</strong> : null}
      {editable ? (
        <div className="scriptr-media__controls">
          <Field>
            <FieldLabel htmlFor={`media-title-${block.id}`}>Title</FieldLabel>
            <Input
              id={`media-title-${block.id}`}
              onChange={(event) => {
                const nextTitle = event.currentTarget.value.trim();
                onChange?.(
                  block.type === 'video'
                    ? { ...block, title: nextTitle || undefined }
                    : { ...block, title: nextTitle || 'Untitled audio' },
                );
              }}
              value={title ?? ''}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`media-text-${block.id}`}>
              {block.type === 'video' ? 'Caption' : 'Transcript'}
            </FieldLabel>
            <Input
              id={`media-text-${block.id}`}
              onChange={(event) => {
                const content = event.currentTarget.value
                  ? [{ type: 'text' as const, text: event.currentTarget.value }]
                  : undefined;
                onChange?.(
                  block.type === 'video'
                    ? { ...block, caption: content }
                    : { ...block, transcript: content },
                );
              }}
              value={
                block.type === 'video'
                  ? inlineText(block.caption)
                  : inlineText(block.transcript)
              }
            />
          </Field>
          <Button onClick={onRemove} size="sm" type="button" variant="ghost">
            <Trash2 data-icon="inline-start" />
            Remove {block.type}
          </Button>
        </div>
      ) : block.type === 'video' && block.caption ? (
        <figcaption>{inlineText(block.caption)}</figcaption>
      ) : block.type === 'audio' && block.transcript ? (
        <figcaption>{inlineText(block.transcript)}</figcaption>
      ) : null}
    </figure>
  );
}

export type MediaUploaderProps = {
  readonly kind: Exclude<MediaKind, 'image'>;
  readonly mediaHost: MediaHost;
  readonly createBlockId: () => string;
  readonly onUploaded: (block: AuthoredMediaBlock) => void;
  readonly onCancel: () => void;
};

export function MediaUploader({
  kind,
  mediaHost,
  createBlockId,
  onUploaded,
  onCancel,
}: MediaUploaderProps) {
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File>();
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const controllerRef = useRef<AbortController | undefined>(undefined);

  const upload = async (file: File) => {
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setUploading(true);
    setError(undefined);
    setProgress(0);
    try {
      const input = {
        kind,
        file,
        signal: controller.signal,
        onProgress: (next: number) =>
          setProgress(Math.max(0, Math.min(1, next))),
      } as const;
      await mediaHost.validate?.(input);
      const media = await mediaHost.upload(input);
      if (media.kind !== kind)
        throw new Error(`The media host returned ${media.kind}, not ${kind}.`);
      const title =
        file.name.replace(/\.[^.]+$/, '') ||
        (kind === 'video' ? 'Video' : 'Audio');
      onUploaded(
        kind === 'video'
          ? {
              id: createBlockId(),
              type: 'video',
              assetId: media.assetId,
              src: media.src,
              title,
              width: media.width,
              height: media.height,
              posterAssetId: media.posterAssetId,
            }
          : {
              id: createBlockId(),
              type: 'audio',
              assetId: media.assetId,
              src: media.src,
              title,
            },
      );
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : `${kind} upload failed.`,
        );
    } finally {
      if (controllerRef.current === controller) setUploading(false);
    }
  };

  return (
    <section aria-label={`Upload ${kind}`} className="scriptr-media-uploader">
      <Input
        accept={`${kind}/*`}
        aria-label={`Choose ${kind}`}
        disabled={uploading}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;
          if (!file.type.startsWith(`${kind}/`)) {
            setError(`Choose a ${kind} file.`);
            return;
          }
          setSelectedFile(file);
          void upload(file);
        }}
        type="file"
      />
      {uploading ? (
        <progress
          aria-label={`${kind} upload progress`}
          max={1}
          value={progress}
        />
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {error && selectedFile ? (
        <Button
          onClick={() => void upload(selectedFile)}
          size="sm"
          type="button"
        >
          Retry upload
        </Button>
      ) : null}
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
    </section>
  );
}

function MediaNodeView({
  node,
  updateAttributes,
  deleteNode,
  editor,
  mediaHost,
}: NodeViewProps & { readonly mediaHost?: MediaHost | undefined }) {
  const parsed = createDocumentCodec().parse({
    version: 2,
    content: [JSON.parse(String(node.attrs.payload))],
  }).content[0];
  if (!parsed || (parsed.type !== 'video' && parsed.type !== 'audio'))
    return <NodeViewWrapper>Invalid media block.</NodeViewWrapper>;
  return (
    <NodeViewWrapper>
      <MediaBlockContent
        block={parsed}
        editable={editor.isEditable}
        mediaHost={mediaHost}
        onChange={(next) => updateAttributes({ payload: JSON.stringify(next) })}
        onRemove={() => {
          deleteNode();
          if (parsed.assetId) void mediaHost?.onRemoved(parsed.assetId);
          if (parsed.type === 'video' && parsed.posterAssetId)
            void mediaHost?.onRemoved(parsed.posterAssetId);
        }}
      />
    </NodeViewWrapper>
  );
}

export const createMediaNodeViewRenderer = (mediaHost: MediaHost | undefined) =>
  ReactNodeViewRenderer((props) => (
    <MediaNodeView {...props} mediaHost={mediaHost} />
  ));
