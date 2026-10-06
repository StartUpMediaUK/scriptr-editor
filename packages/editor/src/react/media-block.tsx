import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import {
  Captions,
  Copy,
  CopyPlus,
  Download,
  Ellipsis,
  Gauge,
  Maximize2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  RotateCw,
  RefreshCw,
  Trash2,
  Video,
  Volume2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button, buttonVariants } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '../components/ui/popover.js';
import { createDocumentCodec } from '../document/codec.js';
import type { AudioBlock, VideoBlock } from '../document/types.js';
import type { HostedMedia, MediaHost, MediaKind } from '../host/media.js';
import { useAudioWaveform } from './use-audio-waveform.js';

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
  readonly onDuplicate?: (() => void) | undefined;
};

export function MediaBlockContent({
  block,
  mediaHost,
  editable = false,
  onChange,
  onRemove,
  onDuplicate,
}: MediaBlockContentProps) {
  const [resolved, setResolved] = useState<HostedMedia>();
  const [posterSource, setPosterSource] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [replacementError, setReplacementError] = useState<string>();
  const mediaRef = useRef<HTMLAudioElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const replacementRef = useRef<HTMLInputElement>(null);
  const posterAssetId =
    block.type === 'video' ? block.posterAssetId : block.coverAssetId;
  useEffect(() => {
    if (block.src || !block.assetId || !mediaHost) return;
    const controller = new AbortController();
    void mediaHost.resolve(block.assetId, controller.signal).then(
      (media) => {
        if (controller.signal.aborted) return;
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

  const source = safeMediaSource(
    block.src ??
      (resolved?.assetId === block.assetId ? resolved?.src : undefined),
  );
  const waveform = useAudioWaveform(
    block.type === 'audio' ? source : undefined,
  );
  const peakScale = Math.max(...(waveform?.peaks ?? []), 0);
  const status =
    unavailable || (!source && !mediaHost) ? 'unavailable' : 'loading';
  const title = block.title;

  return (
    <figure
      className="scriptr-media"
      data-media-kind={block.type}
      ref={figureRef}
    >
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
          <div className="scriptr-audio">
            <div className="scriptr-audio__identity">
              {posterSource ? (
                <img alt="" src={posterSource} />
              ) : (
                <span>
                  <Play />
                </span>
              )}
              {renaming ? (
                <Input
                  autoFocus
                  aria-label="Rename audio"
                  className="scriptr-media__quiet-input"
                  defaultValue={title}
                  onBlur={(event) => {
                    onChange?.({
                      ...block,
                      title: event.currentTarget.value.trim() || block.title,
                    });
                    setRenaming(false);
                  }}
                />
              ) : (
                <strong>{title}</strong>
              )}
            </div>
            <audio
              aria-label={title}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onTimeUpdate={(event) =>
                setProgress(
                  event.currentTarget.duration
                    ? event.currentTarget.currentTime /
                        event.currentTarget.duration
                    : 0,
                )
              }
              preload="metadata"
              ref={mediaRef}
              src={source}
            />
            <div
              className="scriptr-audio__waveform"
              data-waveform-state={waveform?.status}
            >
              {waveform?.status === 'ready' ? (
                <span aria-hidden="true">
                  {waveform.peaks.map((peak, index) => (
                    <i
                      className="min-h-0.5"
                      data-amplitude={peak}
                      data-played={
                        (index + 1) / waveform.peaks.length <= progress
                          ? ''
                          : undefined
                      }
                      key={index}
                      style={{
                        height: `${peakScale ? (peak / peakScale) * 100 : 0}%`,
                      }}
                    />
                  ))}
                </span>
              ) : (
                <span
                  role="status"
                  className="justify-center text-xs text-muted-foreground"
                >
                  {waveform?.status === 'unavailable'
                    ? 'Waveform unavailable'
                    : 'Loading waveform…'}
                </span>
              )}
              <input
                aria-label="Seek audio"
                max="1"
                min="0"
                onChange={(event) => {
                  const audio = mediaRef.current;
                  if (!audio || !audio.duration) return;
                  audio.currentTime =
                    Number(event.currentTarget.value) * audio.duration;
                  setProgress(Number(event.currentTarget.value));
                }}
                step="0.001"
                type="range"
                value={progress}
              />
            </div>
            <div className="scriptr-audio__controls">
              <Button
                aria-label="Playback speed"
                onClick={() => {
                  const next = speed >= 2 ? 0.75 : speed + 0.25;
                  setSpeed(next);
                  if (mediaRef.current) mediaRef.current.playbackRate = next;
                }}
                size="sm"
                variant="ghost"
              >
                <Gauge />
                {speed}×
              </Button>
              <div>
                <Button
                  aria-label="Back 5 seconds"
                  onClick={() => {
                    if (mediaRef.current) mediaRef.current.currentTime -= 5;
                  }}
                  size="icon-sm"
                  variant="ghost"
                >
                  <RotateCcw />
                </Button>
                <Button
                  aria-label={playing ? 'Pause' : 'Play'}
                  onClick={() => {
                    const audio = mediaRef.current;
                    if (audio)
                      void (audio.paused ? audio.play() : audio.pause());
                  }}
                  size="icon-lg"
                >
                  {playing ? <Pause /> : <Play />}
                </Button>
                <Button
                  aria-label="Forward 5 seconds"
                  onClick={() => {
                    if (mediaRef.current) mediaRef.current.currentTime += 5;
                  }}
                  size="icon-sm"
                  variant="ghost"
                >
                  <RotateCw />
                </Button>
              </div>
              <label>
                <Volume2 />
                <input
                  aria-label="Volume"
                  max="1"
                  min="0"
                  onChange={(event) => {
                    const next = Number(event.currentTarget.value);
                    setVolume(next);
                    if (mediaRef.current) mediaRef.current.volume = next;
                  }}
                  step=".05"
                  type="range"
                  value={volume}
                />
              </label>
            </div>
          </div>
        )
      ) : (
        <div className="scriptr-media__placeholder" role="status">
          {block.type === 'video' ? <Video /> : <Play />}
          {status === 'unavailable'
            ? `${block.type === 'video' ? 'Video' : 'Audio'} unavailable`
            : `Loading ${block.type}…`}
        </div>
      )}
      {editable ? (
        <div className="scriptr-editor__context-toolbar scriptr-media__toolbar">
          {block.type === 'audio' ? (
            <Button
              aria-label="Rename audio"
              onClick={() => setRenaming(true)}
              size="icon-sm"
              variant="ghost"
            >
              <Pencil />
            </Button>
          ) : null}
          <Button
            aria-label="Edit caption"
            onClick={() => setCaptionOpen((value) => !value)}
            size="icon-sm"
            variant="ghost"
          >
            <Captions />
          </Button>
          <Button
            aria-label="Expand media"
            onClick={() => void figureRef.current?.requestFullscreen?.()}
            size="icon-sm"
            variant="ghost"
          >
            <Maximize2 />
          </Button>
          {source ? (
            <a
              aria-label="Download media"
              download
              href={source}
              className={buttonVariants({ size: 'icon-sm', variant: 'ghost' })}
            >
              <Download />
            </a>
          ) : null}
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  aria-label="More media options"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <Ellipsis />
            </PopoverTrigger>
            <PopoverContent className="scriptr-media__menu">
              <PopoverTitle className="sr-only">Media options</PopoverTitle>
              <Button
                onClick={() =>
                  void navigator.clipboard?.writeText(
                    source ?? block.assetId ?? '',
                  )
                }
                variant="ghost"
              >
                <Copy />
                Copy
              </Button>
              <Button
                disabled={!mediaHost}
                onClick={() => replacementRef.current?.click()}
                variant="ghost"
              >
                <RefreshCw />
                Replace
              </Button>
              <Button
                disabled={!onDuplicate}
                onClick={onDuplicate}
                variant="ghost"
              >
                <CopyPlus />
                Duplicate
              </Button>
              <Button disabled={!onRemove} onClick={onRemove} variant="ghost">
                <Trash2 />
                Delete
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
      {editable ? (
        <input
          accept={`${block.type}/*`}
          aria-label={`Replace ${block.type} file`}
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file || !mediaHost) return;
            setReplacementError(undefined);
            if (!file.type.startsWith(`${block.type}/`)) {
              setReplacementError(`Choose a ${block.type} file.`);
              return;
            }
            const input = { kind: block.type, file } as const;
            void Promise.resolve()
              .then(() => mediaHost.validate?.(input))
              .then(() =>
                block.assetId && mediaHost.replace
                  ? mediaHost.replace(block.assetId, input)
                  : mediaHost.upload(input),
              )
              .then((media) => {
                if (media.kind !== block.type)
                  throw new Error(
                    `The media host returned ${media.kind}, not ${block.type}.`,
                  );
                onChange?.({
                  ...block,
                  assetId: media.assetId,
                  src: media.src,
                  ...(block.type === 'video'
                    ? {
                        width: media.width,
                        height: media.height,
                        posterAssetId: media.posterAssetId,
                      }
                    : {}),
                });
              })
              .catch((error: unknown) =>
                setReplacementError(
                  error instanceof Error
                    ? error.message
                    : 'Media replacement failed.',
                ),
              );
          }}
          ref={replacementRef}
          tabIndex={-1}
          type="file"
        />
      ) : null}
      {replacementError ? (
        <p role="alert" className="text-sm text-destructive">
          {replacementError}
        </p>
      ) : null}
      {editable && captionOpen ? (
        <Input
          autoFocus
          aria-label={`${block.type} caption`}
          className="scriptr-media__quiet-input"
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
          placeholder="Write a caption…"
          value={
            block.type === 'video'
              ? inlineText(block.caption)
              : inlineText(block.transcript)
          }
        />
      ) : block.type === 'video' && (block.title || block.caption) ? (
        <div className="scriptr-media__details">
          {block.title ? <strong>{block.title}</strong> : null}
          {block.caption ? (
            <figcaption>{inlineText(block.caption)}</figcaption>
          ) : null}
        </div>
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
  getPos,
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
        onDuplicate={() => {
          const position = getPos();
          const id = `media-${Date.now()}`;
          if (typeof position === 'number')
            editor.commands.insertContentAt(position + node.nodeSize, {
              type: 'mediaBlock',
              attrs: {
                id,
                payload: JSON.stringify({ ...parsed, id }),
              },
            });
        }}
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
