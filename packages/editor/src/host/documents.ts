export type DocumentTarget = {
  readonly id: string;
  readonly label: string;
  readonly description?: string | undefined;
};

export type DocumentTargetProvider = {
  readonly search: (
    query: string,
    signal?: AbortSignal,
  ) => Promise<readonly DocumentTarget[]>;
  readonly resolve: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<DocumentTarget | undefined>;
};
