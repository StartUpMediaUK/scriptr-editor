import type { ScriptureAddress } from '../document/types.js';
import type { ScriptureProvider } from '../host/scripture.js';
import {
  validateScriptureAddress,
  validateScriptureStructure,
} from './address.js';

export type ProviderConformanceOptions = {
  readonly sampleAddress: ScriptureAddress;
  readonly sampleTranslationId: string;
  readonly passageExpected?: boolean | undefined;
};

export async function assertScriptureProviderConformance(
  provider: ScriptureProvider,
  options: ProviderConformanceOptions,
) {
  const translations = await provider.listTranslations();
  if (
    !translations.some(
      (translation) => translation.id === options.sampleTranslationId,
    )
  ) {
    throw new Error(
      'The sample translation is absent from listTranslations().',
    );
  }
  const structure = validateScriptureStructure(await provider.getStructure());
  const localValidation = validateScriptureAddress(
    options.sampleAddress,
    structure,
  );
  if (!localValidation.valid) throw new Error(localValidation.reason);
  const canonical = await provider.canonicalizeAddress(options.sampleAddress);
  if (!validateScriptureAddress(canonical, structure).valid) {
    throw new Error('canonicalizeAddress() returned an invalid address.');
  }
  if (options.passageExpected ?? true) {
    const passage = await provider.getPassage(
      canonical,
      options.sampleTranslationId,
    );
    if (!passage.text.trim())
      throw new Error('getPassage() returned empty text.');
    if (!passage.attribution.trim()) {
      throw new Error('getPassage() returned no attribution.');
    }
    if (passage.translationId !== options.sampleTranslationId) {
      throw new Error('getPassage() returned the wrong translation.');
    }
  }
}
