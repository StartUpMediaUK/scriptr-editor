# @startupmedia/scriptr-editor

Reusable rich-text editor infrastructure for Scripture-aware writing applications.

The package is under active development. It provides Canonical Document v2 contracts with deterministic v1 migration, a React rich-text editor, a semantically equivalent read-only renderer, host seams, migrations, extension definitions, and validation codecs.

## Boundary

`@startupmedia/scriptr-editor` owns rich-text editing, canonical documents and migrations, provider-neutral Scripture references, translation comparisons, lightweight References, internal-document-link primitives, image, video, audio and web-bookmark primitives, extensions, and read-only rendering.

Consuming applications own accounts, Pages, workspaces, storage, search, synchronization, sharing, and preferences. Host capabilities are injected through typed APIs. The package does not depend directly on YouVersion or another Scripture provider.

## Development

Requirements:

- Node.js 22.14 or newer for workspace development (Node.js 20.19+ for package consumers)
- pnpm 11.19.0

From the repository root:

```sh
pnpm install
pnpm check
pnpm dev
```

The Vite development harness demonstrates the public editor APIs and maintained design system. Consumer guides and runnable framework examples live in `apps/docs`.

## Foundation interfaces

```ts
import { defineScriptr } from '@startupmedia/scriptr-editor';

export const scriptr = defineScriptr({
  capabilities: {
    scripture: remoteScriptureProvider,
    media: applicationMediaHost,
    bookmarks: applicationBookmarkProvider,
  },
});

const document = scriptr.documents.deserialize(storedJson);
const portableJson = scriptr.documents.serialize(document);
```

Keep credentials in server-only application code. `createScriptrServer` from `@startupmedia/scriptr-editor/server` exposes framework-neutral provider handlers that an application can place behind its authenticated routes.

Consumer guides are available in the repository's [documentation source](https://github.com/StartUpMediaUK/scriptr-editor/tree/main/apps/docs/content/docs), with a runnable Next.js example in the documentation application. These repository links remain usable from the packed README; documentation source is not shipped in the npm artifact.

See the [API guide](https://github.com/StartUpMediaUK/scriptr-editor/blob/main/apps/docs/content/docs/reference/api.mdx), [canonical document guide](https://github.com/StartUpMediaUK/scriptr-editor/blob/main/apps/docs/content/docs/reference/canonical-document-v1.mdx), and [architecture guide](https://github.com/StartUpMediaUK/scriptr-editor/blob/main/apps/docs/content/docs/reference/architecture.mdx) for persisted formats, extension contracts and host seams.

Production integration, canonical search-result navigation, extension failure isolation and bundle budgets are documented in the [production integration guide](https://github.com/StartUpMediaUK/scriptr-editor/blob/main/apps/docs/content/docs/reference/production-hardening.mdx).

## React editor

Import the package stylesheet once in the consuming application, then pass a canonical document to the controlled editor.

```tsx
import {
  ScriptrEditor,
  ScriptrRenderer,
} from '@startupmedia/scriptr-editor/react';
import '@startupmedia/scriptr-editor/styles.css';

<ScriptrEditor
  configuration={scriptr}
  value={document}
  onChange={setDocument}
  onCommand={openCommandWorkflow}
/>;
<ScriptrRenderer document={document} />;
```

The editor includes contextual formatting, categorized slash commands with icons, written notation and keyboard navigation, Markdown shortcuts, external-link creation/editing, block reordering, undo/redo, mobile interactions, and read-only mode. Its visual variables can be scoped through the documented `--scriptr-*` custom properties without replacing the package's layout hierarchy.

Configured Scripture, document-lookup, media and bookmark capabilities automatically enable their package-owned slash-command workflows. References need no external capability: select text, run `/reference`, and author the lightweight annotation in the supplied dialog. External links likewise need no Host capability: use the selection toolbar or `/link`, enter a URL with or without its scheme, and optionally supply the visible label. Clicking an authored link while editing reopens the same link editor.

The stylesheet never fetches fonts or other remote assets. To match the prototype exactly, a host may self-host Cormorant Garamond and Lora; otherwise the declared Georgia/serif fallbacks preserve the hierarchy. Theme overrides should remain limited to the documented `--scriptr-color-*`, `--scriptr-font-*`, `--scriptr-editor-font-size`, and `--scriptr-editor-measure` tokens.

## Scripture references

Scripture access is provider-neutral. A host supplies translations, lightweight book/chapter/verse structure, canonicalization, passage text, attribution, and cache policy through `ScriptureProvider`. The structure can be retained locally so deliberate reference selection remains available offline.

```tsx
import { ScripturePicker } from '@startupmedia/scriptr-editor/react';
import {
  createFakeScriptureProvider,
  parseReferenceQuery,
} from '@startupmedia/scriptr-editor/scripture';

<ScripturePicker structure={localStructure} onSelect={insertReference} />;
```

The picker accepts progressive input such as `Ro`, `Romans 8`, `Romans 8:28`, and `Romans 8:28-30`. Ordinary editor text is never automatically converted into Scripture content. The included fake provider and conformance assertion support deterministic consumer tests without YouVersion or network access.

For private or local text, normalize the data to the documented versioned JSON shape and use the included provider. Source conversion remains entirely host-owned:

```ts
import datasetJson from './private-scripture.json';
import {
  createLocalScriptureProvider,
  parseLocalScriptureDataset,
} from '@startupmedia/scriptr-editor/scripture';

const scriptureProvider = createLocalScriptureProvider(
  parseLocalScriptureDataset(datasetJson),
);
```

The provider ignores JSON property order and exposes canonical books from Genesis through Revelation. See the [API reference](https://github.com/StartUpMediaUK/scriptr-editor/blob/main/apps/docs/content/docs/reference/api.mdx) for the normalized dataset fields, coverage rules, canonical identifiers, and validation behavior.

Pass the same provider to editable and read-only contexts so Scripture and Translation Comparison blocks resolve identically and always retain their address when passage text is unavailable:

```tsx
<ScriptrEditor
  ref={editorRef}
  value={document}
  onChange={setDocument}
  scriptureProvider={scriptureProvider}
/>

<ScriptrRenderer
  document={document}
  scriptureProvider={scriptureProvider}
/>
```

After deliberate picker selection, call `editorRef.current.insertScripture(block)` or `insertTranslationComparison(block)`. Each block stores only its address and translation configuration. The provider result supplies display text, attribution, and cache policy; passage text is not copied into the canonical document.

## References and document links

`ScriptrEditorHandle` exposes `addReference`, `updateReference`, and `removeReference` for the current text selection. `ReferenceEditor` provides the deliberately shallow annotation surface: paragraphs, emphasis, underline, lists, and external links only. Removing a Reference preserves its selected source text; deleting its final anchor automatically removes the orphaned definition.

Reference content travels with its anchor in private editor/clipboard metadata, so undo/redo and copying between editor instances retain the annotation. Pasting assigns new Reference identities to avoid collisions with existing annotations. Invalid clipboard annotations are discarded while their text is retained. This does not change the canonical document format or expose private editor metadata in read-only output.

Internal links use opaque host-owned target IDs. `DocumentLinkPicker` searches a supplied `DocumentTargetProvider`, while `setInternalDocumentLink` applies the selected target to the current editor selection. `extractInternalDocumentLinks` returns the target, containing block, inline path, surrounding context, and character offsets so consuming applications can build backlink and exact-navigation features without putting those concerns in the editor package.

## Media and bookmarks

Media remains host-managed. Pass one `MediaHost` through `defineScriptr` to enable `/image`, `/video`, and `/audio`; the host validates file type, size and quota, reports upload progress, resolves durable asset IDs and decides what removal notifications mean for storage cleanup. The legacy `ImageHost` remains supported for image-only integrations. `ScriptrEditorHandle` also exposes `insertImage`, `insertVideo`, and `insertAudio` for custom host surfaces.

Image crops are non-destructive display frames: square (1:1), landscape (16:9), portrait (4:5), or the original intrinsic ratio. The image settings width field preserves the selected ratio; direct resize handles are currently deferred. Editable and read-only rendering use the same crop. The example app's replacement host stores browser object URLs only for the current session; consuming applications must supply durable storage.

Audio waveforms are derived in the browser from the resolved file’s decoded samples, including all channels. Bar heights show the peak envelope over equal time intervals, scaled relative to the file’s largest peak; silence remains a flat baseline. The waveform is transient, not persisted in the document. Analysis downloads and decodes the complete file, so long recordings incur additional bandwidth and memory. Cross-origin sources must permit fetch access through CORS. Unsupported decoding or inaccessible sources show “Waveform unavailable” without fabricated bars; playback and seeking remain independent of analysis.

Pass a `BookmarkProvider` to enable `/web bookmark`. It receives a normalized HTTP(S) URL and returns safe portable metadata; fetching, sanitizing, caching, authentication and rate limits remain host responsibilities. `BookmarkComposer`, `MediaUploader`, and their block-content components are exported for hosts that want to compose different surrounding UI. Persisted blocks contain only portable identity, source and presentation metadata—never credentials or quota state.

## Releases

The package uses semantic versioning and Changesets. Every release candidate must pass the full quality gate and packed-consumer test. npm publication requires an explicit owner audit and approval.

## License

[MIT](LICENSE) © 2026 StartUp Media UK
