import type { ScriptureAddress } from '@startupmedia/scriptr-editor/document';
import type {
  PassageText,
  ScriptureProvider,
  ScriptureTranslation,
} from '@startupmedia/scriptr-editor/host';
import { ScriptureProviderError } from '@startupmedia/scriptr-editor/host';
import {
  validateScriptureAddress,
  type ScriptureStructure,
} from '@startupmedia/scriptr-editor/scripture';

export type YouVersionBible = ScriptureTranslation & {
  /** Numeric Bible version identifier assigned by YouVersion. */
  readonly youVersionId: number;
};

export type YouVersionRequest = {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
};

export type YouVersionResponse = {
  readonly status: number;
  readonly body?: unknown;
};

export type YouVersionRequestHandler = (
  request: YouVersionRequest,
  signal?: AbortSignal,
) => Promise<YouVersionResponse>;

export type YouVersionProviderOptions = {
  /** Only Bibles licensed for the Host application should be supplied. */
  readonly bibles: readonly YouVersionBible[];
  /** Canonical structure retained by the Host for offline address editing. */
  readonly structure: ScriptureStructure;
  /** Server-mediated request function which owns the YouVersion App Key. */
  readonly request: YouVersionRequestHandler;
};

type YouVersionPassage = {
  readonly id?: string | undefined;
  readonly content: string;
  readonly reference?: string | undefined;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function parsePassage(body: unknown): YouVersionPassage | undefined {
  const candidate = isRecord(body) && isRecord(body.data) ? body.data : body;
  if (!isRecord(candidate) || typeof candidate.content !== 'string') {
    return undefined;
  }
  return {
    content: candidate.content,
    ...(typeof candidate.id === 'string' ? { id: candidate.id } : {}),
    ...(typeof candidate.reference === 'string'
      ? { reference: candidate.reference }
      : {}),
  };
}

function passageId(address: ScriptureAddress) {
  const chapter = `${address.book}.${address.chapter}`;
  if (address.verseStart === undefined) return chapter;
  const start = `${chapter}.${address.verseStart}`;
  return address.verseEnd === undefined ||
    address.verseEnd === address.verseStart
    ? start
    : `${start}-${address.verseEnd}`;
}

function translationMetadata(bible: YouVersionBible): ScriptureTranslation {
  return {
    id: bible.id,
    name: bible.name,
    abbreviation: bible.abbreviation,
    languageTag: bible.languageTag,
    ...(bible.attribution ? { attribution: bible.attribution } : {}),
    ...(bible.copyright ? { copyright: bible.copyright } : {}),
  };
}

function responseError(status: number): ScriptureProviderError {
  if (status === 401 || status === 403) {
    return new ScriptureProviderError(
      'not-licensed',
      'The Host application is not licensed for this YouVersion content.',
      false,
    );
  }
  if (status === 404 || status === 204) {
    return new ScriptureProviderError(
      'not-found',
      'The requested YouVersion passage is unavailable.',
      false,
    );
  }
  if (status === 429) {
    return new ScriptureProviderError(
      'rate-limited',
      'YouVersion temporarily rate-limited the request.',
      true,
    );
  }
  return new ScriptureProviderError(
    'unavailable',
    'YouVersion is temporarily unavailable.',
    true,
  );
}

export function createYouVersionScriptureProvider({
  bibles,
  structure,
  request,
}: YouVersionProviderOptions): ScriptureProvider {
  const configuredBibles = new Map(bibles.map((bible) => [bible.id, bible]));
  if (configuredBibles.size !== bibles.length) {
    throw new Error('YouVersion Bible translation IDs must be unique.');
  }

  return {
    listTranslations(signal) {
      signal?.throwIfAborted();
      return Promise.resolve(bibles.map(translationMetadata));
    },
    getStructure(signal) {
      signal?.throwIfAborted();
      return Promise.resolve(structure);
    },
    canonicalizeAddress(address, signal) {
      signal?.throwIfAborted();
      const validation = validateScriptureAddress(address, structure);
      if (!validation.valid) {
        return Promise.reject(
          new ScriptureProviderError('not-found', validation.reason, false),
        );
      }
      return Promise.resolve(validation.address);
    },
    async getPassage(address, translationId, signal): Promise<PassageText> {
      signal?.throwIfAborted();
      const bible = configuredBibles.get(translationId);
      if (!bible) {
        throw new ScriptureProviderError(
          'not-licensed',
          `YouVersion Bible ${translationId} is not configured for this Host.`,
          false,
        );
      }
      const validation = validateScriptureAddress(address, structure);
      if (!validation.valid) {
        throw new ScriptureProviderError('not-found', validation.reason, false);
      }
      const response = await request(
        {
          path: `/v1/bibles/${bible.youVersionId}/passages/${passageId(validation.address)}`,
          query: {
            format: 'text',
            include_headings: 'false',
            include_notes: 'false',
          },
        },
        signal,
      );
      if (response.status < 200 || response.status >= 300) {
        throw responseError(response.status);
      }
      const passage = parsePassage(response.body);
      if (!passage?.content.trim()) {
        throw new ScriptureProviderError(
          'unavailable',
          'YouVersion returned an invalid passage response.',
          true,
        );
      }
      return {
        address: validation.address,
        translationId,
        text: passage.content.trim(),
        attribution: bible.attribution ?? bible.copyright ?? bible.name,
        cache: 'forbidden',
      };
    },
  };
}
