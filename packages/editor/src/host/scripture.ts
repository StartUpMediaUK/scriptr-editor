import type { ScriptureAddress } from '../document/types.js';
import type { ScriptureStructure } from '../scripture/types.js';

export type ScriptureTranslation = {
  readonly id: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly languageTag: string;
  readonly attribution?: string | undefined;
  readonly copyright?: string | undefined;
};

export type ScriptureCachePolicy = 'forbidden' | 'session' | 'persistent';

export type PassageText = {
  readonly address: ScriptureAddress;
  readonly translationId: string;
  readonly text: string;
  /** Ordered verse boundaries when the provider can preserve them. */
  readonly verses?:
    | readonly { readonly number: number; readonly text: string }[]
    | undefined;
  readonly attribution: string;
  readonly cache: ScriptureCachePolicy;
};

export type ScriptureProviderFailure =
  | 'offline'
  | 'not-found'
  | 'not-licensed'
  | 'rate-limited'
  | 'unavailable';

export class ScriptureProviderError extends Error {
  override readonly name = 'ScriptureProviderError';

  constructor(
    readonly reason: ScriptureProviderFailure,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export type ScriptureProvider = {
  readonly listTranslations: (
    signal?: AbortSignal,
  ) => Promise<readonly ScriptureTranslation[]>;
  readonly getStructure: (signal?: AbortSignal) => Promise<ScriptureStructure>;
  readonly canonicalizeAddress: (
    address: ScriptureAddress,
    signal?: AbortSignal,
  ) => Promise<ScriptureAddress>;
  readonly getPassage: (
    address: ScriptureAddress,
    translationId: string,
    signal?: AbortSignal,
  ) => Promise<PassageText>;
};

export type { ScriptureStructure } from '../scripture/types.js';
