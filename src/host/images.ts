export type ImageUploadInput = {
  readonly file: Blob;
  readonly signal?: AbortSignal | undefined;
  readonly onProgress?: ((progress: number) => void) | undefined;
};

export type HostedImage = {
  readonly assetId: string;
  readonly src: string;
  readonly width: number;
  readonly height: number;
};

export type ImageHost = {
  readonly upload: (input: ImageUploadInput) => Promise<HostedImage>;
  readonly resolve: (
    assetId: string,
    signal?: AbortSignal,
  ) => Promise<HostedImage | undefined>;
  readonly onRemoved: (assetId: string) => void | Promise<void>;
};
