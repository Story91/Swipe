# Contributing to Swipe

Swipe is open source and takes outside contributions. This doc covers how,
and what to expect.

## Where governance stands today

Swipe is in **Phase 1** of a progressive-decentralization plan:

1. **Now — core team.** Anyone can open issues and PRs. Merge and release
   decisions sit with the core maintainers while the protocol is still young.
2. **Later (targeting a few months out) — Snapshot signaling.** $SWIPE
   holders vote off-chain on direction (new market categories, fee changes,
   priorities). Maintainers execute what passes.
3. **Eventually — on-chain governance.** A governor contract controls the
   treasury and protocol parameters, with a multisig as an emergency brake.

This doc will be updated as governance moves through those phases. Don't
assume a PR merges just because CI is green — for anything touching the
contracts or economic parameters, open an issue first to discuss the
approach before investing time in an implementation.

## Getting set up

```bash
npm install
cp .env.local.backup-20260816 .env.local   # or your own — see README for the required keys
npm run dev          # frontend
npm run compile       # contracts
npm run test          # hardhat contract tests
npm run test:unit     # vitest unit tests
```

## Scope of the MIT grant

Before you send a PR, know what license your change lands under — see
[`/NOTICE`](NOTICE) for the full breakdown:

- Frontend, SDK, docs → MIT. Fork it, ship it, PR it back if you'd like.
- `contracts/` → BUSL-1.1 (converts to Apache-2.0 in 2030). You can propose
  changes via PR; production forks that compete with Swipe are the thing
  this license restricts, not contribution.
- `app/components/AIAssistant/` and `app/api/ai-assistant/` → proprietary.
  We generally won't take external PRs against these paths; open an issue
  first if you think something there needs fixing.

## Pull requests

1. Fork the repo and create a branch off `main`.
2. Keep PRs scoped to one change — easier to review, easier to revert.
3. Run `npm run lint`, `npm run test`, and `npm run test:unit` before
   opening the PR.
4. Contract changes need tests in `test/` covering the behavior you're
   adding or fixing, not just a passing compile.
5. Describe the *why*, not just the *what*, in the PR description.

## Reporting bugs

Non-security bugs → open a GitHub issue with repro steps.

Anything that could put user funds or the contracts at risk → do **not**
open a public issue. See [`SECURITY.md`](SECURITY.md).
