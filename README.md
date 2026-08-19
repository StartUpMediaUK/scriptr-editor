# scriptr-editor

Reusable rich-text editor infrastructure for Scripture-aware writing applications.

The package is under active development and does not yet expose an editor. Its architecture and canonical document format will be established through the audited implementation plan before feature APIs are published.

## Boundary

`scriptr-editor` will own rich-text editing, canonical documents and migrations, provider-neutral Scripture references, translation comparisons, lightweight References, internal-document-link primitives, image primitives, extensions, and read-only rendering.

Consuming applications own accounts, Pages, workspaces, storage, search, synchronization, sharing, and preferences. Host capabilities will be injected through typed APIs. The package will not depend directly on YouVersion or another Scripture provider.

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

## Releases

The package uses semantic versioning and Changesets. Every release candidate must pass the full quality gate and packed-consumer test. npm publication requires an explicit owner audit and approval.

## License

[MIT](LICENSE) © 2026 StartUp Media UK
