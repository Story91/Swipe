# Open questions

Decisions still owed, and what each one blocks. An item leaves this file only
when it is decided — moved into [`rules-v3.md`](./rules-v3.md) — or when it
turns out not to matter.

---

## Blocking someone else's work

### 1. The new $SWIPE token

**Blocks:** the fee rebate (§6 of the rules), every screen currently frozen
behind a "coming soon" overlay — daily claims, streaks, jackpots, referrals,
achievements.

Nothing about the token has been settled: chain, supply, whether it is a
migration for existing holders or a fresh issue, whether V3 rewards pay in it at
all or in the stablecoin. The contract will expose a rebate hook so V3 does not
have to be redeployed once this lands, but the reward design itself waits.

A holder snapshot exists at `docs/swipe-holder-snapshot-50065584.json` — 16k
lines — so a migration path is possible if that is the direction.

## Parameters, needed before the contract is final

All four are closed — the contract is written and its parameters are settled.
Kept struck through rather than deleted, so the record of what was asked
survives.

### ~~2. Minimum pool threshold~~

**Dropped, not chosen.** A market that missed a threshold would have refunded
everyone instead of paying out — solving market sprawl a second time while
punishing people for betting on a quiet market. `rules-v3.md` §5.1. Closed
2026-08-17.

### ~~3. Cap on simultaneously open markets~~

**12, enforced in the market creation path.** `registerPrediction` is already
`onlyResolver`, so the backend physically controls how many markets exist; an
on-chain counter would cost a storage write per resolution and guarantee
nothing extra. `rules-v3.md` §5.2. Closed 2026-08-17.

### ~~4. Early-entry bracket boundaries for short markets~~

**Quarters of the market's own lifetime**, not fixed hours — one rule that
works for a two-hour market and a seven-day one alike. Implemented as
`weightBpsAt`. `rules-v3.md` §5.3. Closed 2026-08-17.

### ~~5. Creator bond: size, and where a forfeited bond goes~~

**Moot — the bond was removed.** It widened what the hot resolver key could
reach and was defeated for one cent by wash-betting both sides. Neither size
nor destination needs deciding. See §5.3 of
[the spec](../superpowers/specs/2026-08-17-v3-market-rules-design.md). Closed
2026-08-17.

## Carried over, still unanswered

From [`2026-08-16-swipe-rebuild-design.md`](../superpowers/specs/2026-08-16-swipe-rebuild-design.md) §9:

- **Kalshi's terms** for mirroring markets and reusing settlement data.
- **Regulatory posture** — Robinhood Chain is permissionless but operated by a
  US-regulated broker-dealer, and prediction markets are a sensitive category.
- **Price adapter provider** — must return a *historical* price at a timestamp,
  not spot, or a late cron tick settles on the wrong number.
- ~~`NEXT_PUBLIC_WC_PROJECT_ID` on Vercel~~ — **confirmed present in
  production.** Closed 2026-08-17.
