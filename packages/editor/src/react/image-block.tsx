import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Captions,
  Image as ImageIcon,
  Copy,
  CopyPlus,
  Crop,
  Download,
  Ellipsis,
  Maximize2,
  RefreshCw,
  Trash2,
} from 'lucide-react';

import { Button, buttonVariants } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Field, FieldGroup, FieldLabel } from '../components/ui/field.js';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '../components/ui/popover.js';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group.js';
import { createDocumentCodec } from '../document/codec.js';
import type { ImageBlock } from '../document/types.js';
import type { HostedImage, ImageHost } from '../host/images.js';

function safeImageSource(source: string | undefined) {
  if (!source) return undefined;
  try {
    const url = new URL(source);
    return url.protocol === 'https:' ||
      url.protocol === 'http:' ||
      url.protocol === 'blob:' ||
      (url.protocol === 'data:' && source.startsWith('data:image/'))
      ? source
      : undefined;
  } catch {
    return undefined;
  }
}

export type ImageBlockContentProps = {
  readonly block: ImageBlock;
  readonly imageHost?: ImageHost | undefined;
  readonly editable?: boolean | undefined;
  readonly onChange?: ((block: ImageBlock) => void) | undefined;
  readonly onRemove?: (() => void) | undefined;
  readonly onDuplicate?: (() => void) | undefined;
  readonly captionContent?: ReactNode | undefined;
};

export function ImageBlockContent({
  block,
  imageHost,
  editable = false,
  onChange,
  onRemove,
  onDuplicate,
  captionContent,
}: ImageBlockContentProps) {
  const [resolved, setResolved] = useState<HostedImage>();
  const [unavailable, setUnavailable] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [natural, setNatural] = useState<{
    src: string;
    width: number;
    height: number;
  }>();
  const [replacementError, setReplacementError] = useState<string>();
  const figureRef = useRef<HTMLElement>(null);
  const replacementRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (block.src || !imageHost) return;
    const controller = new AbortController();
    void imageHost.resolve(block.assetId, controller.signal).then(
      (image) => {
        if (controller.signal.aborted) return;
        setResolved(image);
        setUnavailable(!image);
      },
      () => {
        if (!controller.signal.aborted) setUnavailable(true);
      },
    );
    return () => controller.abort();
  }, [block.assetId, block.src, imageHost]);
  const src = safeImageSource(block.src ?? resolved?.src);
  const originalWidth =
    natural && natural.src === src
      ? natural.width
      : (resolved?.width ?? block.width);
  const originalHeight =
    natural && natural.src === src
      ? natural.height
      : (resolved?.height ?? block.height);
  const ratio =
    block.cropRatio === 'square'
      ? 1
      : block.cropRatio === 'landscape'
        ? 16 / 9
        : block.cropRatio === 'portrait'
          ? 4 / 5
          : originalWidth && originalHeight
            ? originalWidth / originalHeight
            : undefined;
  const clampWidth = (width: number) => {
    const maximum =
      figureRef.current?.parentElement?.clientWidth || Number.POSITIVE_INFINITY;
    return Math.round(
      Math.max(Math.min(160, maximum), Math.min(maximum, width)),
    );
  };
  const commitWidth = (width: number) =>
    onChange?.({
      ...block,
      width: clampWidth(width),
      ...(ratio ? { height: Math.round(clampWidth(width) / ratio) } : {}),
      alignment: block.alignment === 'wide' ? 'center' : block.alignment,
    });
  const caption = block.caption
    ?.map((inline) => (inline.type === 'text' ? inline.text : '\n'))
    .join('');
  return (
    <figure
      className="scriptr-image"
      data-alignment={block.alignment}
      data-state={src ? 'ready' : unavailable ? 'unavailable' : 'loading'}
      style={
        block.alignment === 'wide'
          ? undefined
          : { maxWidth: block.width ?? resolved?.width }
      }
      ref={figureRef}
      data-crop-ratio={block.cropRatio ?? 'original'}
    >
      {src ? (
        <div
          className="relative"
          data-image-frame
          style={{ aspectRatio: ratio }}
        >
          <img
            alt={block.alt}
            className="object-cover"
            style={ratio ? { height: '100%', width: '100%' } : undefined}
            onLoad={(event) =>
              setNatural({
                src,
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            height={block.height ?? resolved?.height}
            src={src}
            width={block.width ?? resolved?.width}
          />
        </div>
      ) : (
        <div className="scriptr-image__placeholder" role="status">
          {unavailable || !imageHost ? 'Image unavailable' : 'Loading image…'}
        </div>
      )}
      {editable ? (
        <div className="scriptr-editor__context-toolbar scriptr-media__toolbar">
          <Button
            aria-label="Edit caption"
            onClick={() => setCaptionOpen((value) => !value)}
            size="icon-sm"
            variant="ghost"
          >
            <Captions />
          </Button>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  aria-label="Image settings"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <ImageIcon />
            </PopoverTrigger>
            <PopoverContent align="end" className="scriptr-media__inspector">
              <PopoverTitle>Image settings</PopoverTitle>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`image-alt-${block.id}`}>
                    Alternative text
                  </FieldLabel>
                  <Input
                    id={`image-alt-${block.id}`}
                    onChange={(event) =>
                      onChange?.({ ...block, alt: event.currentTarget.value })
                    }
                    placeholder="Describe this image"
                    value={block.alt}
                  />
                </Field>
                <Field>
                  <FieldLabel>Alignment</FieldLabel>
                  <ToggleGroup
                    aria-label="Image alignment"
                    onValueChange={(alignments) => {
                      const alignment = alignments[0];
                      if (
                        alignment === 'start' ||
                        alignment === 'center' ||
                        alignment === 'end' ||
                        alignment === 'wide'
                      )
                        onChange?.({ ...block, alignment });
                    }}
                    size="sm"
                    value={[block.alignment]}
                    variant="outline"
                  >
                    <ToggleGroupItem value="start">Left</ToggleGroupItem>
                    <ToggleGroupItem value="center">Centre</ToggleGroupItem>
                    <ToggleGroupItem value="end">Right</ToggleGroupItem>
                    <ToggleGroupItem value="wide">Wide</ToggleGroupItem>
                  </ToggleGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`image-width-${block.id}`}>
                    Maximum width
                  </FieldLabel>
                  <Input
                    id={`image-width-${block.id}`}
                    min={160}
                    onChange={(event) => {
                      const width = event.currentTarget.valueAsNumber;
                      if (Number.isFinite(width)) commitWidth(width);
                    }}
                    step={20}
                    type="number"
                    value={block.width ?? resolved?.width ?? ''}
                  />
                </Field>
              </FieldGroup>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  aria-label="Crop image"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <Crop />
            </PopoverTrigger>
            <PopoverContent className="scriptr-media__menu">
              <PopoverTitle>Crop image</PopoverTitle>
              {(['original', 'square', 'landscape', 'portrait'] as const).map(
                (ratio) => (
                  <Button
                    aria-pressed={(block.cropRatio ?? 'original') === ratio}
                    key={ratio}
                    onClick={() => onChange?.({ ...block, cropRatio: ratio })}
                    size="sm"
                    variant="ghost"
                  >
                    {ratio[0]!.toUpperCase() + ratio.slice(1)}
                  </Button>
                ),
              )}
            </PopoverContent>
          </Popover>
          <Button
            aria-label="Expand image"
            onClick={() => void figureRef.current?.requestFullscreen?.()}
            size="icon-sm"
            variant="ghost"
          >
            <Maximize2 />
          </Button>
          {src ? (
            <a
              aria-label="Download image"
              download
              href={src}
              className={buttonVariants({ size: 'icon-sm', variant: 'ghost' })}
            >
              <Download />
            </a>
          ) : null}
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  aria-label="More image options"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <Ellipsis />
            </PopoverTrigger>
            <PopoverContent className="scriptr-media__menu">
              <PopoverTitle className="sr-only">Image options</PopoverTitle>
              <Button
                onClick={() =>
                  void navigator.clipboard?.writeText(src ?? block.assetId)
                }
                variant="ghost"
              >
                <Copy />
                Copy
              </Button>
              <Button
                disabled={!imageHost}
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
          accept="image/*"
          aria-label="Replace image file"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file || !imageHost) return;
            setReplacementError(undefined);
            if (!file.type.startsWith('image/')) {
              setReplacementError('Choose an image file.');
              return;
            }
            const controller = new AbortController();
            void Promise.resolve()
              .then(() => imageHost.validate?.(file))
              .then(() =>
                imageHost.replace
                  ? imageHost.replace(block.assetId, {
                      file,
                      signal: controller.signal,
                    })
                  : imageHost.upload({ file, signal: controller.signal }),
              )
              .then((image) =>
                onChange?.({
                  ...block,
                  assetId: image.assetId,
                  src: image.src,
                  width: image.width,
                  height: image.height,
                }),
              )
              .catch((error: unknown) =>
                setReplacementError(
                  error instanceof Error
                    ? error.message
                    : 'Image replacement failed.',
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
          aria-label="Image caption"
          className="scriptr-image__caption-input"
          onChange={(event) =>
            onChange?.({
              ...block,
              caption: event.currentTarget.value
                ? [{ type: 'text', text: event.currentTarget.value }]
                : undefined,
            })
          }
          placeholder="Add a caption…"
          value={caption ?? ''}
        />
      ) : captionContent || caption ? (
        <figcaption>{captionContent ?? caption}</figcaption>
      ) : null}
    </figure>
  );
}

export type ImageUploaderProps = {
  readonly imageHost: ImageHost;
  readonly createBlockId: () => string;
  readonly onUploaded: (block: ImageBlock) => void;
  readonly onCancel?: (() => void) | undefined;
  readonly replaceAssetId?: string | undefined;
};

export function ImageUploader({
  imageHost,
  createBlockId,
  onUploaded,
  onCancel,
  replaceAssetId,
}: ImageUploaderProps) {
  const [file, setFile] = useState<Blob>();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const uploadController = useRef<AbortController | undefined>(undefined);
  const upload = async (selected: Blob) => {
    const controller = new AbortController();
    uploadController.current?.abort();
    uploadController.current = controller;
    setUploading(true);
    setProgress(0);
    setError(undefined);
    try {
      await imageHost.validate?.(selected);
      const operation =
        replaceAssetId && imageHost.replace
          ? imageHost.replace.bind(imageHost, replaceAssetId)
          : imageHost.upload;
      const image = await operation({
        file: selected,
        signal: controller.signal,
        onProgress: (next) => setProgress(Math.min(1, Math.max(0, next))),
      });
      onUploaded({
        id: createBlockId(),
        type: 'image',
        assetId: image.assetId,
        src: image.src,
        alt: '',
        alignment: 'center',
        width: image.width,
        height: image.height,
      });
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(
        reason instanceof Error ? reason.message : 'Image upload failed.',
      );
    } finally {
      if (uploadController.current === controller) setUploading(false);
    }
  };
  return (
    <section aria-label="Upload image" className="scriptr-image-uploader">
      <Input
        accept="image/*"
        aria-label="Choose image"
        disabled={uploading}
        onChange={(event) => {
          const selected = event.currentTarget.files?.[0];
          if (!selected) return;
          if (!selected.type.startsWith('image/')) {
            setError('Choose an image file.');
            return;
          }
          setFile(selected);
          void upload(selected);
        }}
        type="file"
      />
      {uploading ? (
        <progress aria-label="Image upload progress" max={1} value={progress} />
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {error && file ? (
        <Button onClick={() => void upload(file)} size="sm" type="button">
          Retry upload
        </Button>
      ) : null}
      {onCancel ? (
        <Button
          onClick={() => {
            uploadController.current?.abort();
            setUploading(false);
            onCancel();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      ) : null}
    </section>
  );
}

function ImageNodeView({
  node,
  updateAttributes,
  deleteNode,
  getPos,
  editor,
  imageHost,
}: NodeViewProps & { readonly imageHost?: ImageHost | undefined }) {
  const parsed = createDocumentCodec().parse({
    version: 2,
    content: [JSON.parse(String(node.attrs.payload))],
  }).content[0];
  if (!parsed || parsed.type !== 'image')
    return <NodeViewWrapper>Invalid image block.</NodeViewWrapper>;
  return (
    <NodeViewWrapper>
      <ImageBlockContent
        block={parsed}
        editable={editor.isEditable}
        imageHost={imageHost}
        onChange={(next) => updateAttributes({ payload: JSON.stringify(next) })}
        onDuplicate={() => {
          const position = getPos();
          const id = `image-${Date.now()}`;
          if (typeof position === 'number')
            editor.commands.insertContentAt(position + node.nodeSize, {
              type: 'imageBlock',
              attrs: {
                id,
                payload: JSON.stringify({ ...parsed, id }),
              },
            });
        }}
        onRemove={() => {
          deleteNode();
          void imageHost?.onRemoved(parsed.assetId);
        }}
      />
    </NodeViewWrapper>
  );
}

export const createImageNodeViewRenderer = (imageHost: ImageHost | undefined) =>
  ReactNodeViewRenderer((props) => (
    <ImageNodeView {...props} imageHost={imageHost} />
  ));
