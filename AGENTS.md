# Scriptr Editor Agent Guide

## Read first

- Inspect the existing editor surfaces and Vite example before changing user-facing behaviour or styling. Preserve the established typography, spacing, surfaces and contextual controls.
- Use `apps/docs/content/docs` for public API, integration, compatibility and migration guidance. Update affected guides with contract changes.
- Keep private plans, audits, scratch material and local datasets in ignored `.local/` files or a separate private repository.

## Package boundary

Build `scriptr-editor` as reusable, application-agnostic editor infrastructure. It owns rich-text primitives, canonical documents and migrations, Scripture provider contracts and reference UI, Scripture and comparison blocks, lightweight References, internal-document-link primitives, images, extension APIs, and read-only rendering.

Keep application concerns in consuming applications. Represent users, authentication, workspaces, Pages, journals, search indexes, backlinks, offline sync, storage, sharing, import/export orchestration, and preferences only through neutral data and callback contracts when the editor needs them.

Do not couple the package to YouVersion. Scripture access must pass through a provider interface, and provider-specific licensing, caching, and persistence policy belongs to the provider or consuming application.

## Architecture

- Keep the canonical document model independent from React components and provider implementations.
- Prefer deep modules with small public interfaces. Export intentional entry points; keep implementation details private.
- Separate pure document transforms and validation from interactive editor adapters and UI.
- Make persisted shapes explicit, versioned, validated, serializable, and migration-tested. Avoid embedding application-specific state.
- Model external behaviour through typed capabilities: Scripture resolution, document lookup, image upload/storage, and other host integrations.
- Keep editable and read-only rendering semantically equivalent. Editing chrome must not affect authored output.
- Preserve extensibility through documented block, mark, command, renderer, and migration seams rather than consumer forks.

## Type and code standards

- Use TypeScript strict mode and inference from schemas where practical.
- Avoid `any`, `as any`, and `as unknown` escapes. Fix or narrow the source type.
- Keep modules focused; move reusable pure logic into domain modules rather than UI components.
- Add tests for persisted data, migrations, transforms, provider contracts, commands, keyboard behaviour, accessibility, and renderer parity in proportion to risk.
- Maintain keyboard, pointer, touch, screen-reader, reduced-motion, light, and dark-mode behaviour for every interactive primitive.
- Keep the UI writing-first. Preserve the established typography, spacing, surfaces, borders, contextual controls, responsive behaviour, and restrained accent use.

## Configuration and environment

- Keep `.env.example` present and up to date. Every environment variable addition, rename, or removal must update its validation/loading code, documentation, tests where relevant, and `.env.example` in the same change.
- A reusable editor feature should normally receive configuration through typed props or provider contracts rather than environment variables.
- Never commit secrets or provider credentials.

## Quality gate

Before requesting review, run the full `pnpm check` quality gate. Inspect the packed npm artifact whenever package exports or dependencies change.

Report the completed scope, verification results and material limitations in the change description. Publishing requires explicit maintainer approval.
