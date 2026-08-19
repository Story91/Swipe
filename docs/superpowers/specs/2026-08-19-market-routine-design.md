# Weekly market routine, create and resolve with proof

Date: 2026-08-19
Status: approved design, not yet implemented

## Why

Markets are created by hand with `scripts/create_market.js` and resolved by hand
with a script that still points at the dead V2 dualPool contract. Nothing
records why an outcome was chosen. The routine automates both ends for crypto
price markets and, more importantly, makes every resolution provable: a market
carries a machine-readable resolution recipe from the moment it is created, and
the resolver stores the exact observation it acted on before it touches the
chain.

## Scope

In scope: crypto price markets on Base and Robinhood Chain, created weekly in
one batch per chain, resolved automatically after deadline from a declared
price source, with a stored proof record. A manual admin trigger runs the same
code paths on demand, each with a dry-run preview.

Out of scope for this version: every non-crypto category (Sports, Politics and
the rest), OHLCV-based question templates ("trade above by", "hold above
through"), any dispute or pause flow. Decisions already taken with the owner:
crypto only at the start, resolution always follows the primary source with no
uncertainty band, weekly cadence, dynamic token selection, and the existing
operational key gets the resolver role.

## Fixed facts this design builds on

- Base V4 market: `0x4129d706c283e6bAC749CFe9221AD322981917E6`, collateral
  USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- Robinhood V4 market: `0x41a6Fd3d35C0F9DD13773A763358E35B5216eEe4`, collateral
  USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`.
- Operational key `REGISTRAR_ADDRESS` = `0x75724e9bF95B08359DA046EFA6d49557b675C080`,
  already a registrar on both chains, not yet a resolver on either. Owner is
  `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e`.
- Redis id counter `market:v4:next_id`, record keys `prediction:pred_v4_N`
  (Base, empty prefix) and `robinhood:prediction:pred_v4_N`. Sets follow the
  same prefix rule: `predictions`, `predictions:active`, `predictions:resolved`,
  `predictions:category:<cat>`, counter `predictions:count`, listing cache
  `predictions:index`.
- The card UI renders `imageUrl` inside an iframe when `includeChart` is true
  (TinderCard.tsx), so any embeddable chart URL works. DexScreener pair pages
  with `?embed=1` answer HTTP 200 without frame-blocking headers, verified
  2026-08-19.
- GeckoTerminal has a trending pools endpoint and OHLCV per pool for Base.
  It does not index Robinhood Chain. DexScreener indexes Robinhood Chain but
  its public API returns current price and 24h stats only, no candle history.
- `rules-v3.md` section 5.2 caps simultaneously open markets at 12. The cap is
  an off-chain convention. This design applies it per chain.

## Architecture

New module `lib/marketRoutine/`, pure TypeScript with injected dependencies
(fetch, contract client, Redis), the same pattern as `AllocatorStore` in
`lib/marketAllocator.ts`, so every piece tests without a network.

- `tokenSelection.ts` picks the weekly five per chain.
- `priceProof.ts` reads one price from a declared pool and returns the full
  observation (price, source URL, fetch timestamp, trimmed raw response).
- `createWeeklyMarkets.ts` builds questions, thresholds and deadlines,
  allocates ids through the existing allocator, registers on chain with the
  registrar key, writes the Redis records.
- `resolveExpiredMarkets.ts` finds expired routine markets, executes their
  resolution recipe, resolves on chain with the same key, writes the proof.

Thin API routes call into the module:

- `app/api/cron/create-weekly-markets/route.ts`
- `app/api/cron/resolve-expired-markets/route.ts`

Both accept either `Authorization: Bearer CRON_SECRET` (Vercel Cron) or an
admin session through the existing `requireAdmin`, and both take a `dryRun`
flag that runs everything except transactions and writes.

The Admin Dashboard gains a routine card with four actions: preview the weekly
batch, create it, preview pending resolutions with the prices just fetched,
and resolve now. Previews are the dry-run responses rendered as tables.

Cron config lives in `vercel.json` (the repo has none yet): create weekly on
Wednesday at 12:07 UTC (`7 12 * * 3`), resolve hourly at minute 11
(`11 * * * *`). The Vercel Hobby plan limits crons to daily granularity; if
this project is on Hobby, the resolve cron runs daily and the admin button
covers the gap. Confirm the plan during rollout.

## The resolution recipe and the proof

At creation, every routine market gets two extra fields in its Redis record.

```
createdByRoutine: true,
resolutionSpec: {
  source: 'geckoterminal' | 'dexscreener',
  network: 'base' | 'robinhood',      // the source's network id
  poolAddress: '0x...',               // same pool the card's chart shows
  comparator: 'above',
  threshold: 0.49,                    // USD
  template: 'price_at_close'
}
```

At resolution, before the transaction is sent, the resolver evaluates the
recipe and writes the proof into the record. After the receipt it fills in the
transaction hash.

```
resolutionProof: {
  source: 'geckoterminal',
  sourceUrl: 'https://api.geckoterminal.com/api/v2/networks/base/pools/0x...',
  observedPrice: 0.4712,
  threshold: 0.49,
  comparator: 'above',
  outcome: false,
  fetchedAt: 1787342521,
  deadline: 1787342400,
  resolvedTx: '0x...',
  raw: { ... }                        // trimmed source response
}
```

The record proves what was read, from where, when, and what followed. Anyone
disputing an outcome gets the exact API call to replay.

## Question template

One template in this version, both chains:

    Will TOKEN be above $X when this market closes?

This matches the phrasing of pred_v4_1 and is the only template DexScreener
can prove, since it needs nothing but one price read at the deadline. The
hourly resolver fires within the hour after close and the proof records the
exact fetch time. Richer templates on Base can come later from GeckoTerminal
OHLCV, see future work.

## Token selection

Base. Query GeckoTerminal trending pools for the base network. Drop
stablecoins and wrapped majors by a symbol denylist plus a price heuristic
(anything within 2% of $1.00 is treated as a stable). Require pool liquidity
above $50,000 and 24h volume above $10,000. One market per token symbol. Take
the top five that survive.

Robinhood. DexScreener has no public per-chain ranking endpoint, so the
routine keeps a candidate file of known chain-native tokens (about ten today:
CASHCAT, BRODIE, HOODRAT, ARROW, DIH and whatever gets added), fetches each
candidate's live pairs, applies the same liquidity and volume floors, ranks by
24h volume, and takes five. Editing the candidate list is a one-file change.
When GeckoTerminal indexes the chain, selection switches to trending pools.

Every selected token's canonical pool (highest liquidity pair passing the
floors) becomes both the chart URL and the `resolutionSpec.poolAddress`, so
what people watch is what settles the market.

## Thresholds and deadlines

Threshold distance from the current price scales with the token's own 24h
movement, clamped between 3% and 10%. Direction alternates across the batch,
so some markets need a rise for YES and others just need the price to hold.
The result is rounded to two significant digits.

Deadlines land on a fixed weekend grid, all UTC: Friday 20:00, Saturday 20:00,
Saturday 23:59, Sunday 18:00, Sunday 23:59. The create run computes absolute
unix timestamps for the grid and passes them straight to `registerPrediction`,
no duration arithmetic. The known one-block skew between the requested
deadline and on-chain `createdAt` is irrelevant here because nothing in this
design measures quarters from exact spans.

The batch respects the 12-open cap per chain: count live markets on the target
chain first, trim the batch to fit, log what was trimmed.

## Resolution flow

A dedicated pending set per chain, `routine:pending` under the usual prefix,
gets each created id. The hourly run:

1. Read the pending set, load each record, keep those with
   `deadline < now` and no `resolved` or `cancelled` flag.
2. For each, check on-chain state first with `getPrediction`. Already resolved
   on chain means a previous run died between transaction and Redis write, so
   backfill the mirror and the proof, remove from pending, done. Never send a
   second transaction for the same market.
3. Otherwise fetch the price per the recipe, build the proof, send
   `resolvePrediction(id, outcome)` with the resolver key, wait for the
   receipt, then write proof and mirror updates: `resolved`, `outcome`,
   `resolvedAt`, set moves from active to resolved, drop the listing cache.
4. A failed price fetch skips the market until the next run. After 24
   consecutive failed attempts the market is flagged in the admin routine card
   for a manual decision. The routine never cancels a market on its own.

The contract enforces `block.timestamp >= deadline`, resolver role, and the
not-already-settled checks, so a bug here reverts rather than corrupts.

## Keys and rollout

One-time step, run by the owner key: `scripts/grant_resolver.js` calls
`setResolver(0x75724e9bF95B08359DA046EFA6d49557b675C080, true)` on both
contracts and reads `resolvers()` back to confirm. From then on the routine
signs everything with `REGISTRAR_PRIVATE_KEY`, which can register and resolve
but cannot touch fees, ownership or anyone's funds.

New env var `CRON_SECRET`, set in Vercel and `.env.local`.

Rollout order: grant the resolver role, deploy the routes behind the secret,
run one create batch through the admin dry-run and eyeball it, run it live,
let the hourly resolver settle the current weekend's markets, then enable the
Wednesday cron.

## Testing

Vitest, all dependencies injected, no network in tests.

- Selection: denylist and stable heuristic drop the right pools, floors
  enforced, one market per symbol, candidate ranking by volume.
- Thresholds: clamping to the 3% to 10% band, two-significant-digit rounding,
  direction alternation.
- Proof evaluation: outcome above and below threshold, exact-equality goes to
  NO (price must be strictly above).
- Resolver idempotency: chain says resolved, Redis says pending, run backfills
  without sending. Fetch failure leaves the market pending.
- Cap: batch trims when the chain already has open markets.

Per the repo rule, each test gets broken on purpose once to confirm it can
fail.

## Future work

Base-only templates backed by GeckoTerminal OHLCV, "trade above by" from the
window's high and "hold above through" from the window's low. Non-crypto
categories with `resolutionSpec.source: 'manual'`, which the routine creates
(with a generated SVG data-URI image instead of a chart) but never resolves.
Trending-based selection for Robinhood once GeckoTerminal indexes the chain.
