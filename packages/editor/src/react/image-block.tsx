import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from '../components/ui/button.js';
import { Field, FieldLabel } from '../components/ui/field.js';
import { Input } from '../components/ui/input.js';
import { Slider } from '../components/ui/slider.js';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group.js';
import { createDocumentCodec } from '../document/codec.js';
import type { ImageAlignment, ImageBlock } from '../document/types.js';
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
  readonly captionContent?: ReactNode | undefined;
};

export function ImageBlockContent({
  block,
  imageHost,
  editable = false,
  onChange,
  onRemove,
  captionContent,
}: ImageBlockContentProps) {
  const [resolved, setResolved] = useState<HostedImage>();
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (block.src || !imageHost) return;
    const controller = new AbortController();
    void imageHost.resolve(block.assetId, controller.signal).then(
      (image) => {
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
  const caption = block.caption
    ?.map((inline) => (inline.type === 'text' ? inline.text : '\n'))
    .join('');
  const alignments: readonly ImageAlignment[] = [
    'start',
    'center',
    'end',
    'wide',
  ];

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
    >
      {src ? (
        <img
          alt={block.alt}
          height={block.height ?? resolved?.height}
          src={src}
          width={block.width ?? resolved?.width}
        />
      ) : (
        <div className="scriptr-image__placeholder" role="status">
          {unavailable || !imageHost ? 'Image unavailable' : 'Loading image…'}
        </div>
      )}
      {editable ? (
        <div className="scriptr-image__controls">
          <Field>
            <FieldLabel htmlFor={`image-alt-${block.id}`}>Alt text</FieldLabel>
            <Input
              id={`image-alt-${block.id}`}
              aria-label="Image alt text"
              value={block.alt}
              onChange={(event) =>
                onChange?.({ ...block, alt: event.currentTarget.value })
              }
            />
          </Field>
          <ToggleGroup
            aria-label="Image alignment"
            className="scriptr-image__alignment"
            onValueChange={(values) => {
              const alignment = values[0];
              if (
                alignment === 'start' ||
                alignment === 'center' ||
                alignment === 'end' ||
                alignment === 'wide'
              ) {
                onChange?.({ ...block, alignment });
              }
            }}
            size="sm"
            value={[block.alignment]}
          >
            {alignments.map((alignment) => (
              <ToggleGroupItem key={alignment} value={alignment}>
                {alignment}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Field>
            <FieldLabel>Image width</FieldLabel>
            <Slider
              aria-label="Image width"
              max={1600}
              min={160}
              onValueChange={(width) => {
                const height =
                  block.width && block.height
                    ? Math.max(
                        1,
                        Math.round((width / block.width) * block.height),
                      )
                    : block.height;
                onChange?.({ ...block, width, ...(height ? { height } : {}) });
              }}
              value={block.width ?? resolved?.width ?? 686}
            />
          </Field>
          <Button
            className="scriptr-image__remove"
            onClick={onRemove}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 data-icon="inline-start" />
            Remove image
          </Button>
        </div>
      ) : null}
      {editable ? (
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
