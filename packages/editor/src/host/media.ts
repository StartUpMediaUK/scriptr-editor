export type MediaKind = 'image' | 'video' | 'audio';

export type MediaUploadInput = {
  readonly kind: MediaKind;
  readonly file: Blob;
  readonly signal?: AbortSignal | undefined;
  readonly onProgress?: ((progress: number) => void) | undefined;
};

export type HostedMedia = {
  readonly assetId: string;
  readonly kind: MediaKind;
  readonly src: string;
  readonly mimeType: string;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly durationSeconds?: number | undefined;
  readonly posterAssetId?: string | undefined;
};

export type MediaHost = {
  readonly validate?: (input: MediaUploadInput) => void | Promise<void>;
  readonly upload: (input: MediaUploadInput) => Promise<HostedMedia>;
  readonly resolve: (
    assetId: string,
    signal?: AbortSignal,
  ) => Promise<HostedMedia | undefined>;
  readonly onRemoved: (assetId: string) => void | Promise<void>;
};
