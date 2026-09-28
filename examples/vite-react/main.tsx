import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PACKAGE_NAME } from 'scriptr-editor';
import type { CanonicalDocument } from 'scriptr-editor/document';
import {
  ScriptureProviderError,
  type ScriptureProvider,
} from 'scriptr-editor/host';
import {
  ScriptrEditor,
  ScriptrPresentationProvider,
  ScriptrPresentationSurface,
  ScriptrRenderer,
  ScripturePicker,
  defineReactExtension,
} from 'scriptr-editor/react';
import {
  createLocalScriptureProvider,
  formatScriptureAddress,
  parseLocalScriptureDataset,
  type ScriptureStructure,
} from 'scriptr-editor/scripture';
import { SettingsPanel } from './settings-panel';
import './styles.css';

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
      src: new URL('/generated/study-video.mp4', window.location.href).href,
      title: 'Teaching video',
      caption: [{ type: 'text', text: 'A responsive video block.' }],
      width: 960,
      height: 540,
    },
    {
      id: 'teaching-audio',
      type: 'audio',
      src: new URL('/generated/study-audio.wav', window.location.href).href,
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

type WorkbenchScenario = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly document: CanonicalDocument;
};

type FixtureState = 'ready' | 'loading' | 'error' | 'offline' | 'unavailable';

const fixtureStates: readonly {
  readonly id: FixtureState;
  readonly label: string;
}[] = [
  { id: 'ready', label: 'Ready' },
  { id: 'loading', label: 'Loading' },
  { id: 'error', label: 'Error with retry' },
  { id: 'offline', label: 'Offline' },
  { id: 'unavailable', label: 'Capabilities unavailable' },
];

function isFixtureState(value: string | null): value is FixtureState {
  return fixtureStates.some((state) => state.id === value);
}

const workbenchScenarios: readonly WorkbenchScenario[] = [
  {
    id: 'integrated-study',
    label: 'Integrated study',
    description: 'A realistic long document containing every domain block.',
    document: initialDocument,
  },
  {
    id: 'writing-primitives',
    label: 'Writing primitives',
    description: 'Headings, marks, lists, callouts, code, and dividers.',
    document: {
      version: 2,
      content: [
        {
          id: 'writing-title',
          type: 'heading',
          level: 1,
          content: [{ type: 'text', text: 'Writing primitives' }],
        },
        {
          id: 'writing-marks',
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ', ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
            { type: 'text', text: ', ' },
            {
              type: 'text',
              text: 'underlined',
              marks: [{ type: 'underline' }],
            },
            { type: 'text', text: ', ' },
            {
              type: 'text',
              text: 'struck through',
              marks: [{ type: 'strikethrough' }],
            },
            { type: 'text', text: ', ' },
            {
              type: 'text',
              text: 'inline code',
              marks: [{ type: 'inlineCode' }],
            },
            { type: 'text', text: ', and ' },
            {
              type: 'text',
              text: 'accent text',
              marks: [{ type: 'accent' }],
            },
            { type: 'text', text: ', ' },
            {
              type: 'text',
              text: 'coloured text',
              marks: [{ type: 'textColour', colour: '#7c3aed' }],
            },
            { type: 'text', text: ', and ' },
            {
              type: 'text',
              text: 'highlighted text',
              marks: [{ type: 'highlightColour', colour: '#fde68a' }],
            },
            { type: 'hardBreak' },
            { type: 'text', text: 'A deliberate hard break in one paragraph.' },
          ],
        },
        {
          id: 'writing-h2',
          type: 'heading',
          level: 2,
          content: [{ type: 'text', text: 'Lists and structure' }],
        },
        {
          id: 'writing-bullets',
          type: 'list',
          kind: 'bullet',
          items: [
            {
              id: 'writing-bullet-1',
              content: [{ type: 'text', text: 'A bulleted thought' }],
            },
            {
              id: 'writing-bullet-2',
              content: [{ type: 'text', text: 'A nested thought' }],
              children: [
                {
                  id: 'writing-bullet-2-1',
                  content: [{ type: 'text', text: 'Nested list content' }],
                },
              ],
            },
          ],
        },
        {
          id: 'writing-numbered',
          type: 'list',
          kind: 'numbered',
          start: 3,
          items: [
            {
              id: 'writing-number-1',
              content: [{ type: 'text', text: 'A numbered item' }],
            },
            {
              id: 'writing-number-2',
              content: [{ type: 'text', text: 'Another numbered item' }],
            },
          ],
        },
        {
          id: 'writing-checks',
          type: 'list',
          kind: 'check',
          items: [
            {
              id: 'writing-check-1',
              content: [{ type: 'text', text: 'Completed item' }],
              checked: true,
            },
            {
              id: 'writing-check-2',
              content: [{ type: 'text', text: 'Incomplete item' }],
              checked: false,
            },
          ],
        },
        {
          id: 'writing-quote',
          type: 'blockquote',
          content: [{ type: 'text', text: 'A restrained quotation.' }],
        },
        {
          id: 'writing-callout-info',
          type: 'callout',
          tone: 'info',
          content: [{ type: 'text', text: 'An informational callout.' }],
        },
        {
          id: 'writing-callout-warning',
          type: 'callout',
          tone: 'warning',
          content: [{ type: 'text', text: 'A warning callout.' }],
        },
        {
          id: 'writing-code',
          type: 'codeBlock',
          language: 'text',
          code: 'Type / on an empty line to open the command palette.',
        },
        { id: 'writing-divider', type: 'divider' },
        {
          id: 'writing-final',
          type: 'paragraph',
          content: [{ type: 'text', text: 'Content after a divider.' }],
        },
      ],
    },
  },
  {
    id: 'scripture',
    label: 'Scripture',
    description: 'Real local passages, comparison, and address editing.',
    document: {
      version: 2,
      content: [
        {
          id: 'scripture-title',
          type: 'heading',
          level: 1,
          content: [{ type: 'text', text: 'Scripture blocks' }],
        },
        {
          id: 'scripture-single',
          type: 'scripture',
          address: { book: 'JHN', chapter: 3, verseStart: 16, verseEnd: 17 },
          translationId: 'BSB',
        },
        {
          id: 'scripture-comparison',
          type: 'translationComparison',
          address: { book: 'PSA', chapter: 23, verseStart: 1, verseEnd: 4 },
          translationIds: ['KJV', 'BSB', 'WEBBE'],
          layout: 'twoColumn',
        },
      ],
    },
  },
  {
    id: 'layout',
    label: 'Layout blocks',
    description: 'Columns and disclosure content in editable nested layouts.',
    document: {
      version: 2,
      content: [
        {
          id: 'layout-title',
          type: 'heading',
          level: 1,
          content: [{ type: 'text', text: 'Layout blocks' }],
        },
        initialDocument.content[4] ?? {
          id: 'layout-fallback',
          type: 'paragraph',
          content: [],
        },
        initialDocument.content[5] ?? {
          id: 'toggle-fallback',
          type: 'paragraph',
          content: [],
        },
      ],
    },
  },
  {
    id: 'media',
    label: 'Media and bookmark',
    description: 'Image, video, audio, and bookmark blocks with host controls.',
    document: {
      version: 2,
      content: [
        {
          id: 'media-title',
          type: 'heading',
          level: 1,
          content: [{ type: 'text', text: 'Media and bookmarks' }],
        },
        ...initialDocument.content.slice(6, 9),
        initialDocument.content[11] ?? {
          id: 'media-fallback',
          type: 'paragraph',
          content: [],
        },
      ],
    },
  },
  {
    id: 'links-extensions',
    label: 'Links and extensions',
    description:
      'External links, References, document links, and extension seams.',
    document: {
      version: 2,
      content: [
        {
          id: 'links-title',
          type: 'heading',
          level: 1,
          content: [{ type: 'text', text: 'Links and extensions' }],
        },
        {
          id: 'links-paragraph',
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Open an ' },
            {
              type: 'text',
              text: 'external resource',
              marks: [{ type: 'link', href: 'https://example.com/resource' }],
            },
            { type: 'text', text: ', inspect a ' },
            {
              type: 'text',
              text: 'Reference',
              marks: [{ type: 'reference', referenceId: 'fixture-reference' }],
            },
            { type: 'text', text: ', or visit ' },
            {
              type: 'text',
              text: 'another document',
              marks: [
                { type: 'internalDocumentLink', targetId: 'day-of-the-lord' },
              ],
            },
            { type: 'text', text: '.' },
          ],
        },
        {
          id: 'extension-fixture',
          type: 'extension',
          name: 'workbench-note',
          version: 1,
          data: { label: 'Host extension content' },
        },
      ],
      references: {
        'fixture-reference': {
          id: 'fixture-reference',
          title: 'Workbench Reference',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Reference content for interaction review.',
                },
              ],
            },
          ],
        },
      },
    },
  },
  {
    id: 'empty',
    label: 'Empty document',
    description: 'The initial writing state and insertion affordances.',
    document: {
      version: 2,
      content: [{ id: 'empty-paragraph', type: 'paragraph', content: [] }],
    },
  },
];

function firstScenario(
  scenarios: readonly WorkbenchScenario[],
): WorkbenchScenario {
  const scenario = scenarios[0];
  if (!scenario) throw new Error('Workbench requires a default scenario.');
  return scenario;
}

const defaultScenario = firstScenario(workbenchScenarios);

const workbenchParameters = new URLSearchParams(window.location.search);
const initialScenario =
  workbenchScenarios.find(
    (scenario) => scenario.id === workbenchParameters.get('scenario'),
  ) ?? defaultScenario;
const requestedFixtureState = workbenchParameters.get('state');
const initialFixtureState = isFixtureState(requestedFixtureState)
  ? requestedFixtureState
  : 'ready';

const cloneDocument = (document: CanonicalDocument) =>
  structuredClone(document);

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

const workbenchExtension = defineReactExtension({
  name: 'workbench-note',
  version: 1,
  parseData: (input) =>
    typeof input === 'object' && input !== null && 'label' in input
      ? { label: String(input.label) }
      : { label: 'Host extension content' },
  renderEditable: (data) => (
    <aside className="workbench-extension">Editable: {data.label}</aside>
  ),
  renderReadonly: (data) => (
    <aside className="workbench-extension">Read only: {data.label}</aside>
  ),
  slashItems: [
    {
      id: 'note',
      label: 'Host extension note',
      hint: 'Insert a development extension block',
      notation: '/host-note',
      createBlock: () => ({
        id: `extension-${Date.now()}`,
        type: 'extension',
        name: 'workbench-note',
        version: 1,
        data: { label: 'Inserted host extension content' },
      }),
    },
  ],
});

function DevelopmentHarness({
  embedded = false,
}: {
  readonly embedded?: boolean;
}) {
  const [scenarioId, setScenarioId] = useState(initialScenario.id);
  const [document, setDocument] = useState(() =>
    cloneDocument(initialScenario.document),
  );
  const [preview, setPreview] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedReference, setSelectedReference] = useState<string>();
  const [fixtureState, setFixtureState] =
    useState<FixtureState>(initialFixtureState);
  const [narrowReview, setNarrowReview] = useState(false);
  const [scriptureProvider, setScriptureProvider] =
    useState<ScriptureProvider>();
  const [scriptureStructure, setScriptureStructure] =
    useState<ScriptureStructure>();
  const [scriptureError, setScriptureError] = useState<string>();
  const activeScenario =
    workbenchScenarios.find((scenario) => scenario.id === scenarioId) ??
    defaultScenario;
  const offlineScriptureProvider = useMemo<ScriptureProvider | undefined>(
    () =>
      scriptureProvider
        ? {
            ...scriptureProvider,
            getPassage: () =>
              Promise.reject(
                new ScriptureProviderError(
                  'offline',
                  'The development fixture is offline.',
                  true,
                ),
              ),
          }
        : undefined,
    [scriptureProvider],
  );
  const activeScriptureProvider =
    fixtureState === 'offline'
      ? offlineScriptureProvider
      : fixtureState === 'unavailable'
        ? undefined
        : scriptureProvider;

  const chooseScenario = (nextId: string | null) => {
    const scenario = workbenchScenarios.find(({ id }) => id === nextId);
    if (!scenario) return;
    setScenarioId(scenario.id);
    setDocument(cloneDocument(scenario.document));
    setPreview(false);
    setSelectedReference(undefined);
  };

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
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => setPickerOpen(true)}
            >
              Scripture
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => setPreview((current) => !current)}
            >
              {preview ? 'Edit' : 'Read-only preview'}
            </Button>
            {!embedded ? (
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => setNarrowReview(true)}
              >
                Narrow review
              </Button>
            ) : null}
          </div>
        </div>
        <section
          className="mb-9 grid gap-4 rounded-xl border bg-muted/40 p-4 sm:grid-cols-2"
          aria-label="Workbench controls"
        >
          <Field>
            <FieldLabel>Scenario</FieldLabel>
            <Select value={scenarioId} onValueChange={chooseScenario}>
              <SelectTrigger className="w-full" aria-label="Workbench scenario">
                <SelectValue>
                  {(value: string) =>
                    workbenchScenarios.find(({ id }) => id === value)?.label ??
                    value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="w-max min-w-(--anchor-width)">
                <SelectGroup>
                  {workbenchScenarios.map((scenario) => (
                    <SelectItem key={scenario.id} value={scenario.id}>
                      {scenario.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Fixture state</FieldLabel>
            <Select
              value={fixtureState}
              onValueChange={(value) => {
                if (isFixtureState(value)) setFixtureState(value);
              }}
            >
              <SelectTrigger className="w-full" aria-label="Fixture state">
                <SelectValue>
                  {(value: string) =>
                    fixtureStates.find(({ id }) => id === value)?.label ?? value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {fixtureStates.map((state) => (
                    <SelectItem key={state.id} value={state.id}>
                      {state.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex flex-col gap-3 border-t pt-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-sm leading-relaxed text-muted-foreground">
              {activeScenario.description}
            </p>
            <Button
              className="shrink-0"
              size="sm"
              type="button"
              variant="outline"
              onClick={() =>
                setDocument(cloneDocument(activeScenario.document))
              }
            >
              Reset scenario
            </Button>
          </div>
        </section>
        {fixtureState === 'error' ? (
          <div className="workbench-state" role="alert">
            <p>The selected development fixture could not be loaded.</p>
            <Button
              size="sm"
              type="button"
              onClick={() => setFixtureState('ready')}
            >
              Retry
            </Button>
          </div>
        ) : fixtureState === 'loading' ? (
          <div className="workbench-state" role="status" aria-busy="true">
            Loading the selected development fixture…
          </div>
        ) : scriptureError ? (
          <p role="alert">{scriptureError}</p>
        ) : !scriptureProvider ? (
          <p role="status">Loading Scripture fixtures…</p>
        ) : preview ? (
          <ScriptrRenderer
            key={`${scenarioId}-${fixtureState}-preview`}
            document={document}
            extensions={[workbenchExtension]}
            onReferenceOpen={(reference) =>
              setSelectedReference(reference.title ?? reference.id)
            }
            documentTargetProvider={
              fixtureState === 'unavailable' ? undefined : demoDocumentProvider
            }
            imageHost={
              fixtureState === 'unavailable' ? undefined : demoImageHost
            }
            mediaHost={
              fixtureState === 'unavailable' ? undefined : demoMediaHost
            }
            scriptureProvider={activeScriptureProvider}
          />
        ) : (
          <ScriptrEditor
            key={`${scenarioId}-${fixtureState}-editor`}
            value={document}
            extensions={[workbenchExtension]}
            onChange={setDocument}
            scriptureProvider={activeScriptureProvider}
            bookmarkProvider={
              fixtureState === 'unavailable' ? undefined : demoBookmarkProvider
            }
            documentTargetProvider={
              fixtureState === 'unavailable' ? undefined : demoDocumentProvider
            }
            imageHost={
              fixtureState === 'unavailable' ? undefined : demoImageHost
            }
            mediaHost={
              fixtureState === 'unavailable' ? undefined : demoMediaHost
            }
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
      {narrowReview ? (
        <div
          className="review-backdrop"
          role="dialog"
          aria-label="Narrow review"
        >
          <div className="review-device">
            <div className="review-device__toolbar">
              <span>390 × 700 touch review</span>
              <Button
                aria-label="Close narrow review"
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setNarrowReview(false)}
              >
                Close
              </Button>
            </div>
            <iframe title="Narrow editor review" src="/?review=embedded" />
          </div>
        </div>
      ) : null}
    </main>
  );
}

const root = document.querySelector('#root');

if (!(root instanceof HTMLElement)) {
  throw new Error('Development harness root is missing.');
}

const embeddedReview =
  new URLSearchParams(window.location.search).get('review') === 'embedded';

createRoot(root).render(
  <StrictMode>
    <ScriptrPresentationProvider>
      <ScriptrPresentationSurface>
        <DevelopmentHarness embedded={embeddedReview} />
      </ScriptrPresentationSurface>
    </ScriptrPresentationProvider>
  </StrictMode>,
);
