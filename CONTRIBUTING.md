# Contributing

Read `AGENTS.md` before changing the package. Consumer guides live in `apps/docs/content/docs`; update them when public behavior or contracts change.

Use a focused branch and include tests and documentation with behavioural changes. Keep application-specific behaviour out of the editor package and preserve the existing editor design system.

Before requesting review, run:

```sh
pnpm check
```

Commits should explain one coherent change. Changes to a published API or persisted document shape require a Changeset and corresponding compatibility or migration coverage.

## Release review

Before publishing, confirm the version and npm authority, run `pnpm check` and `pnpm audit --prod`, inspect the packed npm artifact, and verify installation in a clean consumer. Publish from the protected Release workflow only after explicit maintainer approval. Verify the published version and provenance before announcing it. Package versions and canonical document versions advance independently.

The Release workflow runs only from `main`, checks the candidate, uploads its exact tarball and publishes that tarball with provenance. Provenance requires a public source repository. Configure npm's GitHub Actions trusted publisher for owner `StartUpMediaUK`, repository `scriptr-editor`, workflow `release.yml` and environment `npm`. For an initial publication before a trusted publisher exists, the workflow accepts a short-lived granular `NPM_TOKEN` secret in the `npm` environment; grant only the necessary publishing permissions and revoke it after switching to trusted publishing. Keep credentials out of source and working notes.

## Local working material

Keep private plans, audits, scratch files and local datasets in ignored `.local/` files or a separate private repository. Root `/docs/` is reserved for ignored local material; maintained public documentation belongs in `apps/docs/content/docs`. Useful tests and portable fixtures remain tracked.
