import type { ScriptureProvider } from 'scriptr-editor/host';
import { createScriptrServer } from 'scriptr-editor/server';
import {
  createRemoteScriptureProvider,
  type ScriptureTransport,
} from 'scriptr-editor/scripture';

/** In-process transport for contract tests; not an HTTP/security implementation. */
export function createTransportRecipe(provider: ScriptureProvider) {
  const server = createScriptrServer({ scripture: provider });
  const handler = server.scripture;
  if (!handler) throw new Error('Scripture handler is not configured.');
  const transport: ScriptureTransport = async (request, signal) => {
    signal?.throwIfAborted();
    const response = await handler(request, signal);
    signal?.throwIfAborted();
    return response;
  };
  return createRemoteScriptureProvider(transport);
}
