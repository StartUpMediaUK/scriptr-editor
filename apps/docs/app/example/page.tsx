import { createDocumentCodec } from '@startupmedia/scriptr-editor/document';
import '@startupmedia/scriptr-editor/styles.css';
import { WritingExample } from '@/components/writing-example';

export default function ExamplePage() {
  const initialDocument = createDocumentCodec().parse({
    version: 2,
    content: [
      {
        id: 'next-opening',
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Write here to compare editable and read-only output.',
          },
        ],
      },
    ],
  });
  return <WritingExample initialDocument={initialDocument} />;
}
