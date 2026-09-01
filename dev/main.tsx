import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { CanonicalDocument } from '../src/document/types.ts';
import { PACKAGE_NAME } from '../src/index.ts';
import {
  ScripturePicker,
  ScriptrEditor,
  ScriptrRenderer,
} from '../src/react/index.ts';
import { formatScriptureAddress } from '../src/scripture/address.ts';
import type { ScriptureStructure } from '../src/scripture/types.ts';
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

const demoStructure: ScriptureStructure = {
  books: [
    {
      id: 'ROM',
      name: 'Romans',
      aliases: ['Ro', 'Rom'],
      chapters: [
        32, 29, 31, 25, 21, 23, 25, 39, 33, 21, 36, 21, 14, 23, 33, 27,
      ],
    },
    {
      id: 'JHN',
      name: 'John',
      aliases: ['Jn'],
      chapters: [
        51, 25, 36, 54, 47, 71, 53, 59, 41, 42, 57, 50, 38, 31, 27, 33, 26, 40,
        42, 31, 25,
      ],
    },
  ],
};

function DevelopmentHarness() {
  const [document, setDocument] = useState(initialDocument);
  const [preview, setPreview] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedReference, setSelectedReference] = useState<string>();

  return (
    <main className="page-shell">
      <article className="document" aria-labelledby="page-title">
        <p className="kicker">Development harness</p>
        <div className="harness-header">
          <span id="page-title">{PACKAGE_NAME}</span>
          <div className="harness-actions">
            <button type="button" onClick={() => setPickerOpen(true)}>
              Scripture
            </button>
            <button
              type="button"
              onClick={() => setPreview((current) => !current)}
            >
              {preview ? 'Edit' : 'Read-only preview'}
            </button>
          </div>
        </div>
        {preview ? (
          <ScriptrRenderer document={document} />
        ) : (
          <ScriptrEditor value={document} onChange={setDocument} autofocus />
        )}
        {selectedReference ? (
          <p className="selected-reference">Selected: {selectedReference}</p>
        ) : null}
      </article>
      {pickerOpen ? (
        <div className="picker-backdrop">
          <ScripturePicker
            offline
            onCancel={() => setPickerOpen(false)}
            onSelect={(address) => {
              setSelectedReference(
                formatScriptureAddress(address, demoStructure),
              );
              setPickerOpen(false);
            }}
            structure={demoStructure}
          />
        </div>
      ) : null}
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
