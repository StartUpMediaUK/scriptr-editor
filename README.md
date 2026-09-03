# scriptr-editor

Reusable rich-text editor infrastructure for Scripture-aware writing applications.

The package is under active development. It provides audited Canonical Document v1 contracts, a React rich-text editor, a semantically equivalent read-only renderer, host seams, migrations, extension definitions, and validation codecs.

## Boundary

`scriptr-editor` owns rich-text editing, canonical documents and migrations, provider-neutral Scripture references, translation comparisons, lightweight References, internal-document-link primitives, image primitives, extensions, and read-only rendering.

Consuming applications own accounts, Pages, workspaces, storage, search, synchronization, sharing, and preferences. Host capabilities are injected through typed APIs. The package does not depend directly on YouVersion or another Scripture provider.

## Development

Requirements:

- Node.js 20.19 or newer
- pnpm 11.19.0

```sh
pnpm install
pnpm check
pnpm dev
```

The Vite development harness follows the design system in `docs/prototype/Scriptr.html`, which is authoritative for user-facing visual and interaction decisions.

## Foundation interfaces

```ts
import { createDocumentCodec, DOCUMENT_VERSION } from 'scriptr-editor/document';

const codec = createDocumentCodec();
const document = codec.deserialize(storedJson);
const portableJson = codec.serialize(document);
```

See `docs/api.md`, `docs/canonical-document-v1.md`, and `docs/architecture.md` for the public API, persisted format, extension contract, host seams, and compatibility policy.

Production integration, canonical search-result navigation, extension failure isolation, and bundle budgets are documented in `docs/production-hardening.md`.

## React editor

Import the package stylesheet once in the consuming application, then pass a canonical document to the controlled editor.

```tsx
import { ScriptrEditor, ScriptrRenderer } from 'scriptr-editor/react';
import 'scriptr-editor/styles.css';

<ScriptrEditor value={document} onChange={setDocument} />;
<ScriptrRenderer document={document} />;
```

The editor includes contextual formatting, slash commands with keyboard navigation, Markdown shortcuts, block reordering, undo/redo, mobile interactions, and read-only mode. Its visual variables can be scoped through the documented `--scriptr-*` custom properties without replacing the package's layout hierarchy.

The stylesheet never fetches fonts or other remote assets. To match the prototype exactly, a host may self-host Cormorant Garamond and Lora; otherwise the declared Georgia/serif fallbacks preserve the hierarchy. Theme overrides should remain limited to the documented `--scriptr-color-*`, `--scriptr-font-*`, `--scriptr-editor-font-size`, and `--scriptr-editor-measure` tokens.

## Scripture references

Scripture access is provider-neutral. A host supplies translations, lightweight book/chapter/verse structure, canonicalization, passage text, attribution, and cache policy through `ScriptureProvider`. The structure can be retained locally so deliberate reference selection remains available offline.

```tsx
import { ScripturePicker } from 'scriptr-editor/react';
import {
  createFakeScriptureProvider,
  parseReferenceQuery,
} from 'scriptr-editor/scripture';

<ScripturePicker structure={localStructure} onSelect={insertReference} />;
```

The picker accepts progressive input such as `Ro`, `Romans 8`, `Romans 8:28`, and `Romans 8:28-30`. Ordinary editor text is never automatically converted into Scripture content. The included fake provider and conformance assertion support deterministic consumer tests without YouVersion or network access.

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

Internal links use opaque host-owned target IDs. `DocumentLinkPicker` searches a supplied `DocumentTargetProvider`, while `setInternalDocumentLink` applies the selected target to the current editor selection. `extractInternalDocumentLinks` returns the target, containing block, inline path, surrounding context, and character offsets so consuming applications can build backlink and exact-navigation features without putting those concerns in the editor package.

## Images

Images remain host-managed. Pass an `ImageHost` to `ImageUploader`, `ScriptrEditor`, and `ScriptrRenderer`; the host can validate file type, size and quota, report upload progress, resolve durable asset IDs, replace an asset, and decide what removal notifications mean for storage cleanup. `insertImage` adds the returned canonical block. The editor stores only portable identity, presentation metadata, alt text and caption—never credentials or quota state.

## Releases

The package uses semantic versioning and Changesets. Every release candidate must pass the full quality gate and packed-consumer test. npm publication requires an explicit owner audit and approval.

## License

[MIT](LICENSE) © 2026 StartUp Media UK
