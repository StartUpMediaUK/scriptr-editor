import type { ScriptureProvider } from './host/scripture.js';
import { createScriptureTransportHandler } from './scripture/transport.js';

export type ScriptrServerConfig = {
  readonly scripture?: ScriptureProvider | undefined;
};

export function createScriptrServer(config: ScriptrServerConfig) {
  return Object.freeze({
    scripture: config.scripture
      ? createScriptureTransportHandler(config.scripture)
      : undefined,
  });
}
