/** The package identifier exposed for installation and smoke-test tooling. */
export const PACKAGE_NAME = 'scriptr-editor';

/** The initial package API version. This is not the canonical document version. */
export const PACKAGE_API_VERSION = 0;

export { defineScriptr } from './config.js';
export type {
  ScriptrCapabilities,
  ScriptrConfiguration,
  ScriptrConfigInput,
  ScriptrFeatures,
} from './config.js';

export * from './document/index.js';
export * from './extensions/index.js';
export type * from './host/index.js';
export * from './scripture/index.js';
export * from './react/index.js';
