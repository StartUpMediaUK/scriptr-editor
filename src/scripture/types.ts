import type { ScriptureAddress } from '../document/types.js';
export type ScriptureBookStructure = {
  /** Stable provider-neutral identifier used in persisted addresses. */
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  /** Verse count at each one-based chapter index. */
  readonly chapters: readonly number[];
};

export type ScriptureStructure = {
  readonly books: readonly ScriptureBookStructure[];
};

export type AddressValidation =
  | { readonly valid: true; readonly address: ScriptureAddress }
  | { readonly valid: false; readonly reason: string };

export type ReferenceQueryStage =
  | 'book'
  | 'chapter'
  | 'verse'
  | 'range'
  | 'complete';

export type ReferenceQueryResult = {
  readonly query: string;
  readonly stage: ReferenceQueryStage;
  readonly books: readonly ScriptureBookStructure[];
  readonly address?: ScriptureAddress | undefined;
  readonly error?: string | undefined;
};
