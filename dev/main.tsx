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
import { createFakeScriptureProvider } from '../src/scripture/fake-provider.ts';
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
          text: ' — the same argument Paul makes when he calls ',
        },
        {
          type: 'text',
          text: 'Christ the last Adam',
          marks: [{ type: 'reference', referenceId: 'last-adam' }],
        },
        {
          type: 'text',
          text: ' in ',
        },
        {
          type: 'text',
          text: 'The Day of the Lord',
          marks: [
            { type: 'internalDocumentLink', targetId: 'day-of-the-lord' },
          ],
        },
        {
          type: 'text',
          text: '.',
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
    {
      id: 'scripture-romans',
      type: 'scripture',
      address: { book: 'ROM', chapter: 8, verseStart: 28 },
      translationId: 'KJV',
    },
    {
      id: 'comparison-romans',
      type: 'translationComparison',
      address: { book: 'ROM', chapter: 8, verseStart: 28 },
      translationIds: ['KJV', 'WEB'],
      layout: 'twoColumn',
    },
  ],
  references: {
    'last-adam': {
      id: 'last-adam',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Paul develops this comparison in 1 Corinthians 15.',
            },
          ],
        },
      ],
    },
  },
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

const demoProvider = createFakeScriptureProvider({
  structure: demoStructure,
  translations: [
    {
      id: 'KJV',
      name: 'King James Version',
      abbreviation: 'KJV',
      languageTag: 'en',
    },
    {
      id: 'WEB',
      name: 'World English Bible',
      abbreviation: 'WEB',
      languageTag: 'en',
    },
  ],
  passages: [
    {
      address: { book: 'ROM', chapter: 8, verseStart: 28 },
      translationId: 'KJV',
      text: 'And we know that all things work together for good to them that love God.',
      attribution: 'King James Version — development fixture',
      cache: 'persistent',
    },
    {
      address: { book: 'ROM', chapter: 8, verseStart: 28 },
      translationId: 'WEB',
      text: 'We know that all things work together for good for those who love God.',
      attribution: 'World English Bible — development fixture',
      cache: 'persistent',
    },
  ],
});

const demoDocumentProvider = {
  search: () =>
    Promise.resolve([
      {
        id: 'day-of-the-lord',
        label: 'The Day of the Lord',
        description: 'Study',
      },
    ]),
  resolve: (id: string) =>
    Promise.resolve(
      id === 'day-of-the-lord'
        ? { id, label: 'The Day of the Lord', description: 'Study' }
        : undefined,
    ),
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
          <ScriptrRenderer
            document={document}
            documentTargetProvider={demoDocumentProvider}
            scriptureProvider={demoProvider}
          />
        ) : (
          <ScriptrEditor
            value={document}
            onChange={setDocument}
            scriptureProvider={demoProvider}
            autofocus
          />
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
              setDocument((current) => ({
                ...current,
                content: [
                  ...current.content,
                  {
                    id: `scripture-${Date.now()}`,
                    type: 'scripture',
                    address,
                    translationId: 'KJV',
                  },
                ],
              }));
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
