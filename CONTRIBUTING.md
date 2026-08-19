# Contributing

Read `AGENTS.md` and the current plan in `docs/plans/` before changing the package. Work proceeds one owner-audited phase at a time.

Use a focused branch and include tests and documentation with behavioural changes. Keep application-specific behaviour out of the editor package and preserve the canonical prototype's design system.

Before requesting review, run:

```sh
pnpm check
```

Commits should explain one coherent change. Changes to a published API or persisted document shape require a Changeset and, once document versioning exists, an audited migration.
