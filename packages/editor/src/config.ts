import type { ExtensionRegistration } from './extensions/types.js';
import { createDocumentCodec } from './document/codec.js';
import type { DocumentCodec } from './document/codec.js';
import type { BookmarkProvider } from './host/bookmarks.js';
import type { DocumentTargetProvider } from './host/documents.js';
import type { ImageHost } from './host/images.js';
import type { MediaHost } from './host/media.js';
import type { ScriptureProvider } from './host/scripture.js';

export type ScriptrFeatures = {
  readonly scripture: boolean;
  readonly comparison: boolean;
  readonly references: boolean;
  readonly internalLinks: boolean;
  readonly columns: boolean;
  readonly toggles: boolean;
  readonly images: boolean;
  readonly video: boolean;
  readonly audio: boolean;
  readonly bookmarks: boolean;
};

export type ScriptrCapabilities = {
  readonly scripture?: ScriptureProvider | undefined;
  readonly documents?: DocumentTargetProvider | undefined;
  readonly images?: ImageHost | undefined;
  readonly media?: MediaHost | undefined;
  readonly bookmarks?: BookmarkProvider | undefined;
};

export type ScriptrConfigInput = {
  readonly capabilities?: ScriptrCapabilities | undefined;
  readonly features?: Partial<ScriptrFeatures> | undefined;
  readonly extensions?: readonly ExtensionRegistration[] | undefined;
};

export type ScriptrConfiguration = {
  readonly capabilities: ScriptrCapabilities;
  readonly features: ScriptrFeatures;
  readonly extensions: readonly ExtensionRegistration[];
  readonly documents: DocumentCodec;
};

const defaults: ScriptrFeatures = {
  scripture: true,
  comparison: true,
  references: true,
  internalLinks: true,
  columns: true,
  toggles: true,
  images: true,
  video: true,
  audio: true,
  bookmarks: true,
};

function resolveFeatures(
  requested: ScriptrFeatures,
  capabilities: ScriptrCapabilities,
): ScriptrFeatures {
  return {
    ...requested,
    scripture: requested.scripture && capabilities.scripture !== undefined,
    comparison: requested.comparison && capabilities.scripture !== undefined,
    internalLinks:
      requested.internalLinks && capabilities.documents !== undefined,
    images:
      requested.images &&
      (capabilities.images !== undefined || capabilities.media !== undefined),
    video: requested.video && capabilities.media !== undefined,
    audio: requested.audio && capabilities.media !== undefined,
    bookmarks: requested.bookmarks && capabilities.bookmarks !== undefined,
  };
}

export function defineScriptr(
  input: ScriptrConfigInput = {},
): ScriptrConfiguration {
  const extensions = Object.freeze([...(input.extensions ?? [])]);
  const capabilities = Object.freeze({ ...input.capabilities });
  const requestedFeatures = { ...defaults, ...input.features };
  return Object.freeze({
    capabilities,
    features: Object.freeze(resolveFeatures(requestedFeatures, capabilities)),
    extensions,
    documents: createDocumentCodec({ extensions }),
  });
}
