import type {
  PassageText,
  ScriptureProvider,
  ScriptureTranslation,
} from '../host/scripture.js';
import { ScriptureProviderError } from '../host/scripture.js';
import { validateScriptureAddress } from './address.js';
import type { ScriptureStructure } from './types.js';

export type FakePassage = PassageText;

export type FakeScriptureProviderOptions = {
  readonly translations: readonly ScriptureTranslation[];
  readonly structure: ScriptureStructure;
  readonly passages?: readonly FakePassage[] | undefined;
  readonly offline?: boolean | undefined;
};

const passageKey = (address: PassageText['address'], translationId: string) =>
  `${translationId}:${address.book}:${address.chapter}:${address.verseStart ?? ''}:${address.verseEnd ?? ''}`;

export function createFakeScriptureProvider({
  translations,
  structure,
  passages = [],
  offline = false,
}: FakeScriptureProviderOptions): ScriptureProvider {
  const passageMap = new Map(
    passages.map((passage) => [
      passageKey(passage.address, passage.translationId),
      passage,
    ]),
  );
  const checkSignal = (signal?: AbortSignal) => signal?.throwIfAborted();
  const checkOnline = () => {
    if (offline) {
      throw new ScriptureProviderError(
        'offline',
        'Passage text is offline.',
        true,
      );
    }
  };
  const resolve = <Value>(getValue: () => Value) =>
    Promise.resolve().then(getValue);

  return {
    listTranslations(signal) {
      return resolve(() => {
        checkSignal(signal);
        return translations;
      });
    },
    getStructure(signal) {
      return resolve(() => {
        checkSignal(signal);
        return structure;
      });
    },
    canonicalizeAddress(address, signal) {
      return resolve(() => {
        checkSignal(signal);
        const result = validateScriptureAddress(address, structure);
        if (!result.valid) {
          throw new ScriptureProviderError('not-found', result.reason, false);
        }
        return result.address;
      });
    },
    getPassage(address, translationId, signal) {
      return resolve(() => {
        checkSignal(signal);
        checkOnline();
        const passage = passageMap.get(passageKey(address, translationId));
        if (!passage) {
          throw new ScriptureProviderError(
            'not-found',
            'The requested passage is unavailable.',
            false,
          );
        }
        return passage;
      });
    },
  };
}
