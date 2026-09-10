import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';

import { createDocumentCodec } from '../document/codec.js';
import type { ReactExtensionRenderer } from './renderer.js';

function ExtensionNodeView({
  node,
  extensions,
}: NodeViewProps & {
  readonly extensions: readonly ReactExtensionRenderer[];
}) {
  try {
    const block = createDocumentCodec().parse({
      version: 2,
      content: [JSON.parse(String(node.attrs.payload))],
    }).content[0];
    if (!block || block.type !== 'extension')
      throw new Error('Invalid extension block.');
    const extension = extensions.find((item) => item.name === block.name);
    if (!extension?.renderEditable)
      return (
        <NodeViewWrapper className="scriptr-editor__portable-block">
          This content requires the {block.name} extension.
        </NodeViewWrapper>
      );
    if (extension.version !== block.version)
      throw new Error('Unsupported extension version.');
    return (
      <NodeViewWrapper
        className="scriptr-editor__portable-block"
        data-extension={block.name}
      >
        {extension.renderEditable(extension.parseData(block.data), {})}
      </NodeViewWrapper>
    );
  } catch {
    return (
      <NodeViewWrapper className="scriptr-editor__portable-block">
        This extension block could not be displayed.
      </NodeViewWrapper>
    );
  }
}

export const createExtensionNodeViewRenderer = (
  extensions: readonly ReactExtensionRenderer[],
) =>
  ReactNodeViewRenderer((props) => (
    <ExtensionNodeView {...props} extensions={extensions} />
  ));
