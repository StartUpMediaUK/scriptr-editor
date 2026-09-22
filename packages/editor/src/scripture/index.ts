export { canonicalBookDefinitions, canonicalBooks } from './books.js';
export type { CanonicalBookDefinition, CanonicalBookId } from './books.js';
export {
  findScriptureBooks,
  formatScriptureAddress,
  parseReferenceQuery,
  validateScriptureAddress,
  validateScriptureStructure,
} from './address.js';
export type {
  AddressValidation,
  ReferenceQueryResult,
  ReferenceQueryStage,
  ScriptureBookStructure,
  ScriptureStructure,
} from './types.js';
export { createFakeScriptureProvider } from './fake-provider.js';
export type {
  FakePassage,
  FakeScriptureProviderOptions,
} from './fake-provider.js';
export { assertScriptureProviderConformance } from './provider-contract.js';
export type { ProviderConformanceOptions } from './provider-contract.js';
export {
  createLocalScriptureProvider,
  localScriptureDatasetSchema,
  parseLocalScriptureDataset,
} from './local-dataset.js';
export type {
  LocalScriptureDataset,
  LocalScriptureTranslation,
} from './local-dataset.js';
export {
  createRemoteScriptureProvider,
  createScriptureTransportHandler,
} from './transport.js';
export type {
  ScriptureTransport,
  ScriptureTransportRequest,
  ScriptureTransportResponse,
} from './transport.js';
