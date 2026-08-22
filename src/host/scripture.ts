import type { ScriptureAddress } from '../document/types.js';

export type ScriptureTranslation = {
  readonly id: string;
  readonly name: string;
  readonly abbreviation: string;
  readonly languageTag: string;
  readonly attribution?: string | undefined;
};

export type ScriptureBook = {
  readonly id: string;
  readonly name: string;
  readonly abbreviations: readonly string[];
  readonly chapters: readonly number[];
};

export type ScriptureStructure = {
  readonly books: readonly ScriptureBook[];
};

export type PassageText = {
  readonly address: ScriptureAddress;
  readonly translationId: string;
  readonly text: string;
  readonly attribution: string;
  readonly cache: 'forbidden' | 'session' | 'persistent';
};

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
