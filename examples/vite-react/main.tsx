import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { PACKAGE_NAME } from 'scriptr-editor';
import type { CanonicalDocument } from 'scriptr-editor/document';
import type { ScriptureProvider } from 'scriptr-editor/host';
import {
  ScriptrPresentationProvider,
  ScriptrPresentationSurface,
  ScripturePicker,
  ScriptrEditor,
  ScriptrRenderer,
} from 'scriptr-editor/react';
import {
  createLocalScriptureProvider,
  formatScriptureAddress,
  parseLocalScriptureDataset,
  type ScriptureStructure,
} from 'scriptr-editor/scripture';
import './styles.css';
import 'scriptr-editor/styles.css';
import { SettingsPanel } from './settings-panel';

const initialDocument: CanonicalDocument = {
  version: 2,
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
      id: 'study-columns',
      type: 'columns',
      columns: [
        {
          id: 'study-column-observation',
          content: [
            {
              id: 'study-column-observation-heading',
              type: 'heading',
              level: 3,
              content: [{ type: 'text', text: 'Observation' }],
            },
            {
              id: 'study-column-observation-body',
              type: 'paragraph',
              content: [{ type: 'text', text: 'What does the passage say?' }],
            },
          ],
        },
        {
          id: 'study-column-application',
          content: [
            {
              id: 'study-column-application-heading',
              type: 'heading',
              level: 3,
              content: [{ type: 'text', text: 'Application' }],
            },
            {
              id: 'study-column-application-body',
              type: 'paragraph',
              content: [{ type: 'text', text: 'How should this shape today?' }],
            },
          ],
        },
      ],
    },
    {
      id: 'study-toggle',
      type: 'toggle',
      headingLevel: 2,
      defaultOpen: true,
      summary: [{ type: 'text', text: 'Study notes' }],
      content: [
        {
          id: 'study-toggle-body',
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'This disclosure keeps supporting detail close without interrupting the main reading flow.',
            },
          ],
        },
      ],
    },
    {
      id: 'teaching-video',
      type: 'video',
      src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      title: 'Teaching video',
      caption: [{ type: 'text', text: 'A responsive video block.' }],
      width: 960,
      height: 540,
    },
    {
      id: 'teaching-audio',
      type: 'audio',
      src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
      title: 'Teaching audio',
      transcript: [{ type: 'text', text: 'An optional transcript.' }],
    },
    {
      id: 'further-reading',
      type: 'webBookmark',
      url: 'https://example.com/study',
      title: 'Further reading',
      description: 'A host-resolved web bookmark fixture.',
      siteName: 'Example',
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
      translationIds: ['KJV', 'BSB', 'WEBBE'],
      layout: 'twoColumn',
    },
    {
      id: 'study-image',
      type: 'image',
      assetId: 'development-open-bible',
      alt: 'An open Bible represented by a quiet placeholder illustration',
      alignment: 'center',
      width: 900,
      height: 480,
      caption: [
        { type: 'text', text: 'A place for Scripture and reflection.' },
      ],
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

const demoImageHost = {
  upload: () =>
    Promise.reject(new Error('Uploads are disabled in this fixture.')),
  resolve: (assetId: string) =>
    Promise.resolve(
      assetId === 'development-open-bible'
        ? {
            assetId,
            src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="900" height="480" viewBox="0 0 900 480"%3E%3Crect width="900" height="480" rx="18" fill="%23eee9df"/%3E%3Cpath d="M450 105c-74-48-158-49-250-17v264c92-32 176-31 250 17 74-48 158-49 250-17V88c-92-32-176-31-250 17Z" fill="%23fffdf8" stroke="%23c8bda9" stroke-width="4"/%3E%3Cpath d="M450 105v264" stroke="%23c8bda9" stroke-width="4"/%3E%3C/svg%3E',
            width: 900,
            height: 480,
          }
        : undefined,
    ),
  onRemoved: () => undefined,
};

const demoMediaHost = {
  upload: () =>
    Promise.reject(new Error('Uploads are disabled in this fixture.')),
  resolve: () => Promise.resolve(undefined),
  onRemoved: () => undefined,
};

const demoBookmarkProvider = {
  resolve: (url: string) =>
    Promise.resolve({
      url,
      title: 'Resolved development bookmark',
      description: 'Metadata supplied by the development host.',
      siteName: new URL(url).hostname,
    }),
};

function DevelopmentHarness() {
  const [document, setDocument] = useState(initialDocument);
  const [preview, setPreview] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedReference, setSelectedReference] = useState<string>();
  const [scriptureProvider, setScriptureProvider] =
    useState<ScriptureProvider>();
  const [scriptureStructure, setScriptureStructure] =
    useState<ScriptureStructure>();
  const [scriptureError, setScriptureError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    void fetch('/generated/scripture-dataset.json', {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Scripture fixture request failed.');
        const provider = createLocalScriptureProvider(
          parseLocalScriptureDataset(await response.json()),
        );
        const structure = await provider.getStructure(controller.signal);
        if (current) {
          setScriptureProvider(provider);
          setScriptureStructure(structure);
        }
      })
      .catch((error: unknown) => {
        if (current && !controller.signal.aborted) {
          setScriptureError(
            error instanceof Error
              ? error.message
              : 'Scripture fixtures could not be loaded.',
          );
        }
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, []);

  return (
    <main className="page-shell">
      <article className="document" aria-labelledby="page-title">
        <p className="kicker">Development harness</p>
        <div className="harness-header">
          <span id="page-title">{PACKAGE_NAME}</span>
          <div className="harness-actions">
            <SettingsPanel />
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
        {scriptureError ? (
          <p role="alert">{scriptureError}</p>
        ) : !scriptureProvider ? (
          <p role="status">Loading Scripture fixtures…</p>
        ) : preview ? (
          <ScriptrRenderer
            document={document}
            documentTargetProvider={demoDocumentProvider}
            imageHost={demoImageHost}
            mediaHost={demoMediaHost}
            scriptureProvider={scriptureProvider}
          />
        ) : (
          <ScriptrEditor
            value={document}
            onChange={setDocument}
            scriptureProvider={scriptureProvider}
            bookmarkProvider={demoBookmarkProvider}
            documentTargetProvider={demoDocumentProvider}
            imageHost={demoImageHost}
            mediaHost={demoMediaHost}
            autofocus
          />
        )}
        {selectedReference ? (
          <p className="selected-reference">Selected: {selectedReference}</p>
        ) : null}
      </article>
      {pickerOpen && scriptureStructure ? (
        <div className="picker-backdrop">
          <ScripturePicker
            offline
            onCancel={() => setPickerOpen(false)}
            onSelect={(address) => {
              setSelectedReference(
                formatScriptureAddress(address, scriptureStructure),
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
            structure={scriptureStructure}
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
    <ScriptrPresentationProvider>
      <ScriptrPresentationSurface>
        <DevelopmentHarness />
      </ScriptrPresentationSurface>
    </ScriptrPresentationProvider>
  </StrictMode>,
);
