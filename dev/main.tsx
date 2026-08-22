import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { CanonicalDocument } from '../src/document/types.ts';
import { PACKAGE_NAME } from '../src/index.ts';
import { ScriptrEditor, ScriptrRenderer } from '../src/react/index.ts';
import './styles.css';
import '../src/react/styles.css';

const initialDocument: CanonicalDocument = {
  version: 1,
  content: [
    {
      id: 'title',
      type: 'heading',
      level: 1,
      content: [{ type: 'text', text: 'The Seven Seals' }],
    },
    {
      id: 'intro',
      type: 'paragraph',
      content: [
        { type: 'text', text: 'John does not open the seals. ' },
        { type: 'text', text: 'The Lamb does', marks: [{ type: 'bold' }] },
        {
          type: 'text',
          text: ' — the same argument Paul makes when he calls Christ the last Adam.',
        },
      ],
    },
    {
      id: 'quote',
      type: 'blockquote',
      content: [
        {
          type: 'text',
          text: 'Worthy is the Lamb that was slain to receive power, and riches, and wisdom.',
        },
      ],
    },
    {
      id: 'callout',
      type: 'callout',
      tone: 'note',
      content: [
        {
          type: 'text',
          text: "Select text for formatting, or type '/' on a new line for blocks.",
        },
      ],
    },
  ],
};

function DevelopmentHarness() {
  const [document, setDocument] = useState(initialDocument);
  const [preview, setPreview] = useState(false);

  return (
    <main className="page-shell">
      <article className="document" aria-labelledby="page-title">
        <p className="kicker">Development harness</p>
        <div className="harness-header">
          <span id="page-title">{PACKAGE_NAME}</span>
          <button
            type="button"
            onClick={() => setPreview((current) => !current)}
          >
            {preview ? 'Edit' : 'Read-only preview'}
          </button>
        </div>
        {preview ? (
          <ScriptrRenderer document={document} />
        ) : (
          <ScriptrEditor value={document} onChange={setDocument} autofocus />
        )}
      </article>
    </main>
  );
}

const root = document.querySelector('#root');

if (!(root instanceof HTMLElement)) {
  throw new Error('Development harness root is missing.');
}

createRoot(root).render(
  <StrictMode>
    <DevelopmentHarness />
  </StrictMode>,
);
