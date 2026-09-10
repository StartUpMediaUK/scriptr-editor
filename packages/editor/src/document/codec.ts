import { z, ZodError } from 'zod';

import { createExtensionRegistry } from '../extensions/registry.js';
import type { ExtensionRegistration } from '../extensions/types.js';
import { migrateDocument } from './migrations.js';
import type { DocumentMigration } from './migrations.js';
import { canonicalDocumentSchema } from './schema.js';
import { DOCUMENT_VERSION } from './types.js';
import type { Block, CanonicalDocument, ExtensionBlock } from './types.js';

export type DocumentIssue = {
  readonly path: string;
  readonly message: string;
};

export class DocumentValidationError extends Error {
  readonly issues: readonly DocumentIssue[];

  constructor(message: string, issues: readonly DocumentIssue[]) {
    super(message);
    this.name = 'DocumentValidationError';
    this.issues = issues;
  }
}

export type DocumentCodec = {
  readonly parse: (input: unknown) => CanonicalDocument;
  readonly deserialize: (serialized: string) => CanonicalDocument;
  readonly serialize: (document: CanonicalDocument) => string;
};

export type DocumentCodecOptions = {
  readonly extensions?: readonly ExtensionRegistration[];
  readonly migrations?: readonly DocumentMigration[];
};

function isExtensionBlock(block: Block): block is ExtensionBlock {
  return block.type === 'extension';
}

function sortSerializable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortSerializable);
  if (typeof value !== 'object' || value === null) return value;

  const objectResult = z.record(z.string(), z.unknown()).safeParse(value);
  if (!objectResult.success) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(objectResult.data).sort()) {
    const child = objectResult.data[key];
    if (child !== undefined) sorted[key] = sortSerializable(child);
  }
  return sorted;
}

function normalizeDocument(
  document: CanonicalDocument,
  validateExtension: (block: ExtensionBlock) => ExtensionBlock,
): CanonicalDocument {
  const content = document.content.map((block) =>
    isExtensionBlock(block) ? validateExtension(block) : block,
  );
  const references = document.references
    ? Object.fromEntries(
        Object.entries(document.references).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      )
    : undefined;

  return references
    ? { version: DOCUMENT_VERSION, content, references }
    : { version: DOCUMENT_VERSION, content };
}

function issuesFrom(error: ZodError): readonly DocumentIssue[] {
  return error.issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join('.'),
  }));
}

export function createDocumentCodec(
  options: DocumentCodecOptions = {},
): DocumentCodec {
  const extensionRegistry = createExtensionRegistry(options.extensions ?? []);
  const migrations = options.migrations ?? [];

  const parse = (input: unknown): CanonicalDocument => {
    try {
      const migrated = migrateDocument(
        input,
        DOCUMENT_VERSION,
        migrations,
      ).value;
      const parsed = canonicalDocumentSchema.parse(migrated);
      return normalizeDocument(parsed, extensionRegistry.validate);
    } catch (error) {
      if (error instanceof DocumentValidationError) throw error;
      if (error instanceof ZodError) {
        throw new DocumentValidationError(
          'Canonical document validation failed.',
          issuesFrom(error),
        );
      }
      const message =
        error instanceof Error ? error.message : 'Unknown document error.';
      throw new DocumentValidationError(message, [{ path: '', message }]);
    }
  };

  return {
    parse,
    deserialize(serialized) {
      let input: unknown;
      try {
        input = JSON.parse(serialized);
      } catch {
        throw new DocumentValidationError(
          'Canonical document is not valid JSON.',
          [{ path: '', message: 'Invalid JSON.' }],
        );
      }
      return parse(input);
    },
    serialize(document) {
      return JSON.stringify(sortSerializable(parse(document)));
    },
  };
}
