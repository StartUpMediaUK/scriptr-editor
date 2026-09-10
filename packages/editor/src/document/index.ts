export { createDocumentCodec, DocumentValidationError } from './codec.js';
export type {
  DocumentCodec,
  DocumentCodecOptions,
  DocumentIssue,
} from './codec.js';
export { extractInternalDocumentLinks } from './links.js';
export type { InternalDocumentLinkEdge } from './links.js';
export { findDocumentLocations } from './locations.js';
export type { CanonicalLocation, LocatedDocumentMatch } from './locations.js';
export { documentV1ToV2Migration, migrateDocument } from './migrations.js';
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
  AudioBlock,
  CanonicalDocument,
  ColumnLayoutBlock,
  ExtensionBlock,
  ImageBlock,
  InlineContent,
  InternalDocumentLinkMark,
  JsonValue,
  Mark,
  Reference,
  ScriptureAddress,
  ScriptureBlock,
  ToggleBlock,
  TranslationComparisonBlock,
  VideoBlock,
  WebBookmarkBlock,
} from './types.js';
