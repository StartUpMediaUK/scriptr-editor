import type { ScriptureAddress } from '../document/types.js';
import type {
  PassageText,
  ScriptureProvider,
  ScriptureProviderFailure,
  ScriptureTranslation,
} from '../host/scripture.js';
import { ScriptureProviderError } from '../host/scripture.js';
import type { ScriptureStructure } from './types.js';

export type ScriptureTransportRequest =
  | { readonly operation: 'listTranslations' }
  | { readonly operation: 'getStructure' }
  | {
      readonly operation: 'canonicalizeAddress';
      readonly address: ScriptureAddress;
    }
  | {
      readonly operation: 'getPassage';
      readonly address: ScriptureAddress;
      readonly translationId: string;
    };

export type ScriptureTransportSuccess =
  | {
      readonly operation: 'listTranslations';
      readonly value: readonly ScriptureTranslation[];
    }
  | { readonly operation: 'getStructure'; readonly value: ScriptureStructure }
  | {
      readonly operation: 'canonicalizeAddress';
      readonly value: ScriptureAddress;
    }
  | { readonly operation: 'getPassage'; readonly value: PassageText };

export type ScriptureTransportResponse =
  | { readonly ok: true; readonly result: ScriptureTransportSuccess }
  | {
      readonly ok: false;
      readonly reason: ScriptureProviderFailure;
      readonly message: string;
      readonly retryable: boolean;
    };

export type ScriptureTransport = (
  request: ScriptureTransportRequest,
  signal?: AbortSignal,
) => Promise<ScriptureTransportResponse>;

function unwrap(
  response: ScriptureTransportResponse,
): ScriptureTransportSuccess {
  if (response.ok) return response.result;
  throw new ScriptureProviderError(
    response.reason,
    response.message,
    response.retryable,
  );
}

export function createRemoteScriptureProvider(
  transport: ScriptureTransport,
): ScriptureProvider {
  return {
    async listTranslations(signal) {
      const result = unwrap(
        await transport({ operation: 'listTranslations' }, signal),
      );
      if (result.operation !== 'listTranslations')
        throw new Error('Unexpected Scripture transport response.');
      return result.value;
    },
    async getStructure(signal) {
      const result = unwrap(
        await transport({ operation: 'getStructure' }, signal),
      );
      if (result.operation !== 'getStructure')
        throw new Error('Unexpected Scripture transport response.');
      return result.value;
    },
    async canonicalizeAddress(address, signal) {
      const result = unwrap(
        await transport({ operation: 'canonicalizeAddress', address }, signal),
      );
      if (result.operation !== 'canonicalizeAddress')
        throw new Error('Unexpected Scripture transport response.');
      return result.value;
    },
    async getPassage(address, translationId, signal) {
      const result = unwrap(
        await transport(
          { operation: 'getPassage', address, translationId },
          signal,
        ),
      );
      if (result.operation !== 'getPassage')
        throw new Error('Unexpected Scripture transport response.');
      return result.value;
    },
  };
}

export function createScriptureTransportHandler(
  provider: ScriptureProvider,
): ScriptureTransport {
  return async (request, signal) => {
    try {
      switch (request.operation) {
        case 'listTranslations':
          return {
            ok: true,
            result: {
              operation: request.operation,
              value: await provider.listTranslations(signal),
            },
          };
        case 'getStructure':
          return {
            ok: true,
            result: {
              operation: request.operation,
              value: await provider.getStructure(signal),
            },
          };
        case 'canonicalizeAddress':
          return {
            ok: true,
            result: {
              operation: request.operation,
              value: await provider.canonicalizeAddress(
                request.address,
                signal,
              ),
            },
          };
        case 'getPassage':
          return {
            ok: true,
            result: {
              operation: request.operation,
              value: await provider.getPassage(
                request.address,
                request.translationId,
                signal,
              ),
            },
          };
      }
    } catch (error) {
      if (error instanceof ScriptureProviderError)
        return {
          ok: false,
          reason: error.reason,
          message: error.message,
          retryable: error.retryable,
        };
      return {
        ok: false,
        reason: 'unavailable',
        message: 'Scripture provider failed.',
        retryable: true,
      };
    }
  };
}
