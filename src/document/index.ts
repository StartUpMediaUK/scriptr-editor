export { createDocumentCodec, DocumentValidationError } from './codec.js';
export type {
  DocumentCodec,
  DocumentCodecOptions,
  DocumentIssue,
} from './codec.js';
export { extractInternalDocumentLinks } from './links.js';
export type { InternalDocumentLinkEdge } from './links.js';
export { migrateDocument } from './migrations.js';
export type { DocumentMigration, MigrationResult } from './migrations.js';
export {
  blockSchema,
  canonicalDocumentSchema,
  extensionBlockSchema,
  jsonValueSchema,
  scriptureAddressSchema,
} from './schema.js';
export { DOCUMENT_VERSION } from './types.js';
export type {
  Block,
  CanonicalDocument,
  ExtensionBlock,
  ImageBlock,
  InlineContent,
  InternalDocumentLinkMark,
  JsonValue,
  Mark,
  Reference,
  ScriptureAddress,
  ScriptureBlock,
  TranslationComparisonBlock,
} from './types.js';
