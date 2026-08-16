# Swipe — Automated Settlement, Kalshi Mirroring, and Robinhood Chain

**Date:** 2026-08-16
**Status:** Design — approved in outline, pending spec review

---

## 1. Context

Swipe is a Next.js 15 prediction-market mini-app on Base, with Upstash Redis as the
only persistence layer and two independent, non-interoperating market contracts:

| | `PredictionMarketV2` | `PredictionMarket_USDC_DualPool` |
|---|---|---|
| Address (Base) | `0x2bA339Df34B98099a9047d9442075F7B3a792f74` | `0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205` |
| Collateral | native ETH + `$SWIPE` | USDC (6 dec) |
| Metadata | on-chain strings | off-chain (Redis) |
| Resolve authority | `onlyOwner` | `onlyResolver` (owner **or** `resolvers[]` mapping) |
| Ownership transfer | **none — permanently the deployer** | two-step `transferOwnership`/`acceptOwnership` |
| Resolve time guard | `afterDeadline` + hard `resolutionDeadline` wall | **none** |

Both are immutable (no proxy). Both use pro-rata parimutuel payout, not an AMM.
Neither has any oracle: today an admin clicks a button and signs two transactions.

Everything below rests on facts verified against source, the compiled ABIs, and —
for Robinhood Chain — live RPC calls. Where something could not be confirmed it is
marked explicitly as an open question in §9.

### 1.1 What is being fixed separately

A companion bugfix pass (already applied) corrected corrupt tuple indices in the
incremental sync, a silently-failing stake sync, two broken scripts, a missing test
mock, and Redis status-set pollution. Those are prerequisites, not part of this
design. The remaining known defect — **69 of 70 API routes have no authentication** —
is in scope here, because automation makes it materially worse.

---

## 2. Goals

1. **Automatic settlement** — markets resolve from a declared data source rather than
   an admin's judgement, with an auditable evidence trail.
2. **Automatic creation** — new markets are mirrored from Kalshi rather than
   hand-written.
3. **Robinhood Chain support** — the same app, serving a second chain, with a UI
   switcher.

### Non-goals

- Deploying `$SWIPE` to Robinhood Chain (separate project; see §9).
- Replacing the parimutuel payout model with an AMM.
- Migrating existing Base markets to a new contract.

---

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Resolution authority | **Phase C now, Phase B later** | See §5 — V2 cannot be automated safely |
| Auto-resolution source | Price API for crypto; Kalshi settlement for mirrored markets | See §4.1 |
| Auto-creation source | Kalshi mirror | Real questions, real settlement source |
| Robinhood collateral | **USDG only** (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`) | No canonical USDC exists there; USDG is 6-decimal, so it is an address swap with no math change |
| Multi-chain shape | One app, UI chain switcher | Forces the chain-config layer that is needed anyway |

---

## 4. Architecture

### 4.1 Resolution sources

The two chosen answers — "mirror Kalshi" and "resolve from a price API" — do not
compose directly: most Kalshi markets are elections, macro and weather, which a
crypto price API cannot settle. They reconcile once resolution source becomes a
property of the market rather than a global strategy.

```ts
type ResolutionSource =
  | { kind: 'price';  asset: string; cmp: '>' | '<'; target: number }
  | { kind: 'kalshi'; ticker: string }
  | { kind: 'manual' };
```

Each source has an adapter behind one interface:

```ts
interface ResolutionAdapter {
  kind: ResolutionSource['kind'];
  // null = cannot determine yet; the engine retries rather than guessing
  resolve(source: ResolutionSource, prediction: RedisPrediction):
    Promise<{ outcome: boolean; evidence: Evidence } | null>;
}

interface Evidence {
  source: string;      // 'coingecko' | 'kalshi' | ...
  raw: unknown;        // verbatim payload used for the decision
  observedAt: number;  // unix seconds
  url?: string;
}
```

Adding a fourth source later is a new file, not a redesign.

**Evidence is persisted before any transaction is sent.** Today nothing records
*why* a market resolved the way it did — `resolvedBy` is the string literal
`'admin'` with a `// TODO: Get actual admin address` beside it. Under automation
that gap makes disputes unanswerable.

### 4.2 Settlement engine

A Vercel cron hits `POST /api/cron/settle`:

1. Select predictions past `deadline`, not resolved, `resolutionSource.kind !== 'manual'`.
2. Ask the adapter. `null` → leave for the next tick.
3. Write evidence to Redis.
4. Dispatch settlement (§5).
5. Retry with backoff; escalate on repeated failure.

**Deadline alarm.** V2's `resolutionDeadline` (`deadline + 7 days`, frozen per
market at creation) is a hard wall: past it `resolvePrediction` reverts and the only
remaining path is `cancelPrediction` → full refunds. The engine must alert while
there is still time to act, not after.

**Guard the USDC contract's missing check.** `PredictionMarket_USDC_DualPool.resolvePrediction`
has no `afterDeadline` modifier — a resolver can settle while betting is still open.
The engine must never call it before `deadline`, since the contract will not refuse.

### 4.3 Creation engine — Kalshi mirror

Cron hits `POST /api/cron/mirror-kalshi`:

1. Pull Kalshi markets; filter by volume, category and close time.
2. Deduplicate via `kalshi:<ticker> → predictionId` in Redis.
3. Create the market and register its pool.
4. Store `resolutionSource: { kind: 'kalshi', ticker }`.

**Mirrored markets are created stablecoin-pool-only** — no V2 leg. "Stablecoin" here
means whatever the active chain's config declares: USDC on Base, USDG on Robinhood.
That is what makes them fully automatable (§5) and the main reason to prefer them for
the first phase.

### 4.4 Chain abstraction

Today `base` is imported directly in 21 files, the RPC fallback string
`https://mainnet.base.org` is hardcoded in 17, and three different env var names
(`NEXT_PUBLIC_BASE_RPC_URL`, `NEXT_PUBLIC_RPC_URL`, `ALCHEMY_RPC_URL`) address the
same endpoint. A `lib/chains/` module becomes the single source:

```ts
interface ChainConfig {
  key: 'base' | 'robinhood';
  viemChain: Chain;
  rpcUrl: string;
  contracts: { v2?: Address; dualPool?: Address; swipeClaim?: Address };
  collateral: { native: 'ETH'; stable: { address: Address; symbol: string; decimals: number } };
  explorer: string;
}
```

Robinhood Chain, verified live:

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | 4663 (`0x1237`) | 46630 (`0xb626`) |
| RPC | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` | `https://explorer.testnet.chain.robinhood.com` |
| Gas token | ETH (bridged) | test ETH (faucet live) |

Stack is Arbitrum Orbit / Nitro, ArbOS 61, deployment **permissionless** (confirmed
by docs, press release, and an `eth_estimateGas` contract-creation probe from an
unfunded address). Bridge: the standard Arbitrum Orbit portal.

**Compiler portability is confirmed empirically:** `npx hardhat compile` reports
`evm target: paris`, so PUSH0 is not emitted. Do **not** add
`evmVersion: 'shanghai' | 'cancun'` to `hardhat.config.js`; if the toolchain is ever
upgraded, pin `paris` explicitly rather than inheriting a new default.

### 4.5 Redis namespacing — the riskiest step

Keys are currently chain-agnostic (`prediction:pred_v2_1`). A second chain requires
`prediction:base:pred_v2_1` / `prediction:robinhood:...`, which is a migration of
live production data.

Executed as its own reversible step:

1. Introduce a namespaced writer, keep reading both (dual-read, new key first).
2. Backfill existing keys under the `base` namespace.
3. Verify counts match, then retire the legacy read path.

No other work in this design may begin the migration until the settlement engine is
stable, so that a rollback never has to unwind two changes at once.

---

## 5. Settlement authority — the core constraint

`PredictionMarketV2.resolvePrediction` is `onlyOwner`, there is no separate resolver
role, and **the contract has no `transferOwnership` function at all**. Automating V2
therefore requires the owner key — which can also withdraw fees, pause the contract
and cancel any market — to live on the server. There is no way to scope it down.

The USDC/USDG contract does not have this problem: `setResolver(address,bool)` grants
a narrow, revocable role, and ownership itself is transferable in two steps.

### Phase C (now)

- **Stablecoin leg (USDC on Base, USDG on Robinhood): fully automatic.** A dedicated
  hot resolver key, authorised via `setResolver`, never the owner key. Rotatable by
  revoking one mapping entry.
- **V2 leg: assisted, not automatic.** The engine determines the outcome, records
  evidence, and surfaces a one-click confirmation in the admin UI; the owner key
  stays in the admin's wallet and signs from the browser, exactly as today.
- **Mirrored Kalshi markets have no V2 leg**, so they settle end-to-end with no human.

This is what makes "C" coherent rather than half a feature: markets that need a human
get the judgement work removed but keep the human signature; markets designed for
automation get full automation.

### Phase B (later)

Deploy `PredictionMarketV3` with a resolver role and two-step ownership, matching the
USDC contract's model. Then the V2 leg automates the same way.

V3 is worth doing regardless of automation: V2's missing `transferOwnership` means a
lost deployer key permanently strands every future market, since each one eventually
passes its `resolutionDeadline` and becomes unresolvable and unrefundable.

### Security preconditions

Automation cannot ship onto the current API surface. Before the engine goes live:

1. **Cron routes** authenticate via `CRON_SECRET`, never a `NEXT_PUBLIC_*` value.
2. **Admin routes** verify a wallet signature server-side — recover the address and
   check it against a server-only allowlist. The present gate is a client-side
   `NEXT_PUBLIC_ADMIN_1 === address` comparison in seven components, which controls
   rendering only; no API route checks any caller identity.
3. **The resolver key is not the owner key**, and is stored only as a Vercel
   environment secret.
4. `rescueOrphanedUSDC(expectedPoolsTotal)` trusts an off-chain figure and will
   transfer live user stakes if that figure is understated. It must never be reachable
   from an automated path, and should be exercised only manually.

---

## 6. Phasing

| Phase | Deliverable | Gate to proceed |
|---|---|---|
| 0 | Bugfixes | ✅ done — typecheck, 33 tests, build all green |
| 1 | Chain-config layer + Robinhood **testnet** deploy | Contract verified on Blockscout testnet |
| 2 | API authentication (cron + admin signature) | No unauthenticated mutating route remains |
| 3 | Settlement engine, Base: USDC-leg auto + V2-leg assisted | Evidence recorded for every settlement |
| 4 | Kalshi mirror creation | Dedup holds across restarts |
| 5 | Redis namespacing migration | Dual-read verified, counts match |
| 6 | Robinhood mainnet (USDG DualPool) | Phase 1 + 5 complete |
| 7 | V3 with resolver role → Phase B | — |

Phase 1 comes first because it answers a live question cheaply: the exact solc
`evmVersion` Robinhood accepts is not documented, and the testnet faucet works.

---

## 7. Testing

- **Contracts.** The USDC DualPool suite is restored (33 passing) via a new
  `contracts/mocks/MockUSDC.sol`. Any V3 work extends it. `PredictionMarketV2` has
  **no coverage** — `test/PredictionMarket.test.js` targets the removed
  `PredictionMarket_Optimized.sol` and is skipped; writing a real V2 suite is a
  prerequisite for Phase 7.
- **Adapters.** Pure functions over recorded fixtures — no live network in tests.
- **Engine.** Deadline-boundary cases: before deadline (must not settle), after
  `resolutionDeadline` (must alarm, not attempt), adapter returning `null`.
- **Chain config.** Assert no module imports `base` from `viem/chains` outside
  `lib/chains/`, so the abstraction cannot silently regress.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Redis migration corrupts production | Dual-read, backfill, verify, then retire. Its own phase, own rollback |
| Wrong token address on Robinhood | Explorer search returns **impostor** "USD Coin" tokens at 18 decimals. Only `0x5fc5360D…` (USDG, verified `symbol()`/`decimals()` on-chain) is permitted, pinned in chain config |
| Resolver key leak | Narrow role, revocable via `setResolver`, never the owner key |
| Kalshi ToS / API terms | Verify before Phase 4 — see §9 |
| Automated settlement is wrong | Evidence recorded pre-transaction; adapters return `null` rather than guess |
| Robinhood sequencer censorship | Centralised sequencer; L2BEAT stage rating unverified. Accept for USDG-only markets, revisit before moving material volume |

---

## 9. Open questions

1. **Kalshi's terms** for mirroring markets and reusing settlement data — must be
   confirmed before Phase 4.
2. **Regulatory posture.** Robinhood Chain is permissionless but operated by a
   US-regulated broker-dealer, and prediction markets are a sensitive category. No
   acceptable-use policy for deployed applications was located.
3. **Public RPC limits** are undocumented; the docs steer production traffic to
   Alchemy. Assume the public endpoint is best-effort.
4. **Price adapter provider** not yet chosen. GeckoTerminal is already integrated for
   charts; CoinGecko is the likely settlement source. Whichever is picked must give a
   *historical* price at a timestamp, not just spot — otherwise a late cron tick
   settles on the wrong number.
5. **`$SWIPE` on Robinhood** is out of scope, so Robinhood markets have no SWIPE
   rewards, claims, or daily-task mechanics. Confirm this is acceptable product-wise.
