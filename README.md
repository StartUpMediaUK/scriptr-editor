# Scriptr Editor workspace

This monorepo contains the reusable `scriptr-editor` package, its documentation application, and supported integration examples.

## Workspace

- `packages/editor` — the publishable `scriptr-editor` package;
- `apps/docs` — the private Fumadocs application;
- `examples/vite-react` — the interactive Vite and React development harness.

Use Node.js 20.19 or newer and pnpm 11.19.0.

```sh
pnpm install
pnpm check
pnpm dev
```

The implementation plan and phase audits live in `docs/plans`. Publication requires an explicit approved release audit and separate owner authorization.
