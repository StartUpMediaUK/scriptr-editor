import type {
  HostedMedia,
  MediaHost,
  MediaUploadInput,
} from 'scriptr-editor/host';

// Session-only test storage; real applications supply their own durable host.
const assets = new Map<string, HostedMedia>();
const objectUrls = new Set<string>();
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  for (const url of objectUrls) URL.revokeObjectURL(url);
});

function imageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('This image could not be decoded.'));
    image.src = src;
  });
}

async function upload(input: MediaUploadInput): Promise<HostedMedia> {
  input.signal?.throwIfAborted();
  if (!input.file.type.startsWith(`${input.kind}/`))
    throw new Error(`Choose a ${input.kind} file.`);
  const src = URL.createObjectURL(input.file);
  objectUrls.add(src);
  try {
    const dimensions = input.kind === 'image' ? await imageDimensions(src) : {};
    input.signal?.throwIfAborted();
    const media: HostedMedia = {
      assetId: crypto.randomUUID(),
      src,
      kind: input.kind,
      mimeType: input.file.type,
      ...dimensions,
    };
    assets.set(media.assetId, media);
    input.onProgress?.(1);
    return media;
  } catch (error) {
    objectUrls.delete(src);
    URL.revokeObjectURL(src);
    throw error;
  }
}

export const developmentMediaHost: MediaHost = {
  upload,
  replace: (assetId, input) => {
    void assetId;
    return upload(input);
  },
  resolve: (assetId) => Promise.resolve(assets.get(assetId)),
  // Retain old assets for undo/redo until this browser session ends.
  onRemoved: () => undefined,
};
