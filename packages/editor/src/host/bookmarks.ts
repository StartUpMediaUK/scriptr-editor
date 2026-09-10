export type BookmarkMetadata = {
  readonly url: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly siteName?: string | undefined;
  readonly imageAssetId?: string | undefined;
};

export type BookmarkProvider = {
  readonly resolve: (
    url: string,
    signal?: AbortSignal,
  ) => Promise<BookmarkMetadata>;
};
