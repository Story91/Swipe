# Handoff — 2026-08-17

State at the end of a long session. Read this before touching anything.

---

## 1. Where the code is

| Branch | Head | Pushed? | Contains |
|---|---|---|---|
| `main` | `88c7aad` | ✅ synced | All UI fixes shipped today, all docs, both plans, the spec |
| `v3-contract` | `48b411a` | ✅ pushed | The whole V3 contract: 18 commits, 71 tests passing |

**`main` is production.** Vercel deploys from it. `v3-contract` is a feature branch; pushing it triggers a Vercel *preview* build, which is how a build break got caught (see §5).

## 2. ⚠️ `main` has an unpushed commit carrying an armed landmine

`869b65e` sits on local `main`, **not pushed**. It fixes the two production bugs in §4.1 — the chain check and the lying toast — and typecheck and build both pass. A duplicate copy is on the branch `fix/chain-aware-bet-guard` (also unpushed).

**Read this before pushing it.**

The agent that wrote it disclosed a fund-loss risk it deliberately did not fix, because fixing it was out of its scope:

> `CONTRACTS.V2`, used by every `writeContract` call in `TinderCard.tsx`, is a module-load-time constant fixed to Base's V2 address regardless of the active chain. If `ROBINHOOD_USDG_DUALPOOL` or `ROBINHOOD_TESTNET_USDG_DUALPOOL` is ever set before the real V3 migration lands, the new guard would pass but the write would still target the wrong (Base) address.

It does not manifest today: both env vars are unset, so `getWritableMarket()` returns `null` and the bet is refused.

**But setting that env var is the first step of deploying V3.** The landmine is armed by the very next thing you plan to do. Before that env var is set, either make the contract address follow the active chain, or add an explicit guard that refuses a write whose target address does not belong to the selected chain.

Decision left open on purpose: push it (both fixes are real improvements and the mine is unarmed today), or hold it until the address is chain-aware. Do not push it *and* set the env var in the same sitting.

`artifacts/` and `cache/` churn is pre-existing noise from hardhat runs — leave it.

## 3. What V3 actually is now

The contract is `contracts/PredictionMarket_V3.sol` (renamed from `PredictionMarket_USDG_DualPool`).

**Two mechanics were designed. Only one shipped.**

- ✅ **Time-weighted stakes.** A bet's weight is frozen at bet time by which quarter of the market's lifetime it lands in: ×1.50 / ×1.25 / ×1.00. It decides how the losing pool is split. Stake always returns raw; only the share of the losers is weighted. `exitEarly` removes weight proportionally, rounded **up**, against the exiting user.
- ❌ **Creator bond — designed, built, then removed.** Three commits build it, one removes it. History kept deliberately, because the reason it went is worth reading (§5).

Plus: an `exitEarly` guard against a real exploit, and a deploy script applying platform fee 3%, `minBet` 0.1, on hardcoded collateral addresses.

## 4. Next steps, in order

### 4.1 Resolve the uncommitted TinderCard work (§2)

Two production bugs, both found by the audit:

1. **`handleStakeBet` calls `isReadOnlyChain()` with no argument** (`TinderCard.tsx` ~line 1058). That defaults to Base, which is `readOnly: true`, so *every* swipe-driven bet is refused regardless of the chain the user selected. `useActiveChain().isReadOnly` is the chain-aware version and is already used in `ChainSwitcher.tsx` and `app/prediction/[id]/page.tsx`. **This is a launch blocker: after V3 deploys, betting would still be refused.**
2. **The "Stake Accepted" toast fires on drag release** — before the dialog, before any signature, before any transaction. It tells the user something happened when nothing has.

**The trap in fixing #1:** making the check chain-aware must not turn "always blocked" into "attempts a write against the zero address". Robinhood mainnet has no market contract configured. Verify `getWritableMarket()` returning `null` still refuses the bet.

### 4.2 Fix the stale docs — the bond is gone but still documented

`docs/v3/rules-v3.md` and `docs/superpowers/specs/2026-08-17-v3-market-rules-design.md` both still describe the creator bond as a live feature. `rules-v3.md` is the file the user-facing **Help & FAQ and manifesto get rewritten from**, so leaving it would document a mechanic that does not exist.

Three separate corrections needed:

1. Remove §5.4 (creator bond) from `rules-v3.md` and the bond rows from the spec's decisions table and §5.3.
2. **Delete this sentence and the reasoning built on it** — it appears in `rules-v3.md` §5.4 and in the spec:
   > *"A market that pays out necessarily had stake on both sides, so this is one rule, not four."*

   **It is false.** With `yesPool = 100`, `noPool = 0`, resolving YES: `winnersPool > 0`, so the paying path runs. It survived two per-task reviews because it sounded right and the test only covered the sub-case where the *empty* side wins. Do not leave it in a document that seeds future features.
3. `rules-v3.md` §4 still points at `contracts/PredictionMarket_USDG_DualPool.sol`, which no longer exists.

### 4.3 Scoped re-review of everything after the final review

The final whole-branch review passed with no Critical. **Then the money code changed three more times** — bond removed, exploit guard added, guard narrowed to the final quarter. None of that has been reviewed by anyone but the agent who wrote it.

This is the last gate before merge. Scope it to `git diff <final-review-head>..48b411a`. The final review's own diff package is at `.superpowers/sdd/2026-08-17-v3-contract/review-0f11d07..7a6a4ad.diff`.

**Demand mutation proofs, not green suites.** Twice this session a test passed while the thing it claimed to guard was broken. Both times only "break it deliberately and confirm the test fails" caught it.

### 4.4 Then merge `v3-contract` → `main`

Merging will *not* delete `docs/v3/ui-backlog.md` or the WalletConnect fix, despite what `git diff main..v3-contract` suggests — those files were created on `main` after the branch was cut, so a diff shows them as deletions. A merge keeps them.

### 4.5 Deploy to Base — the owner's call, not an agent's

`npm run deploy:v3:base`. Collateral addresses are hardcoded on purpose: searching Robinhood Chain's explorer for "USDC" returns 18-decimal impostors with no liquidity. The script also refuses any token not reporting 6 decimals, and refuses any network it has no vetted address for.

There is deliberately **no `deploy:v3:robinhood` script.** Base is first.

## 5. Decisions already made — do not re-litigate

| Decision | Why |
|---|---|
| **Parimutuel stays** | "Winners take from losers" is the model, not a V2 feature. An AMM would need platform capital in every market. |
| **One contract, not two** | Considered keeping a "safe V2" alongside V3; it was a misunderstanding — V3 has the same payout model. |
| **Platform fee 3% of the losing pool** | Not 3% of volume: the contract caps at 5% of the losing pool, a volume fee collapses on lopsided markets (95/5 → 60% of winnings), and it would break the promise that a correct prediction never returns less than it cost. |
| **The fee is not the revenue problem** | At 0.391 ETH lifetime volume, 1% and 10% both round to nothing. The levers are the 12-market cap and the early-entry bonus. |
| **No minimum pool** | Dropped. It solved market sprawl a second time while punishing users for betting on a quiet market. |
| **12-market cap enforced off-chain** | `registerPrediction` is already `onlyResolver`, so the backend controls it. An on-chain counter costs a storage write per resolution and guarantees nothing extra. |
| **Creator bond removed entirely** | It let the hot resolver key pull tokens from *any* wallet holding an allowance — every bettor — with no consent from that address, against audit finding 8. And it was defeated for one cent by wash-betting both sides. Bought real blast-radius expansion for a mechanic that did not work. |
| **`exitEarly` guard only in the final quarter** | Unconditional, it stranded the sole backer of a side — the *normal* case in markets averaging 0–2 players, i.e. exactly the early users the ×1.50 bonus exists to attract. Accepted residual: an outcome certain early could still be escaped. |
| **Base first, Robinhood after** | Robinhood needs Redis key namespacing first. |
| **USDC only at launch; WETH later** | Two collaterals against a 12-market cap means six markets each, working against the concentration the whole design is for. |
| **Token does not block the contract** | V3 is collateralised in USDC and has no `$SWIPE` dependency. Only the fee rebate and the frozen gamification screens wait on the token. |

**Open and unresolved:** the token is planned for Robinhood while the markets are on Base. That splits the reward loop — a user betting on Base would have to bridge to collect a rebate, and most will not. Three ways out are written up in `docs/v3/ui-backlog.md`. Decide before the token ships.

## 6. What is documented where

| File | What it holds |
|---|---|
| `docs/superpowers/specs/2026-08-17-v3-market-rules-design.md` | The spec. Binding authority. |
| `docs/superpowers/plans/2026-08-17-v3-contract.md` | The contract plan, all 10 tasks executed |
| `docs/v3/rules-v3.md` | Living rules — **the source Help & FAQ and the manifesto get rewritten from** |
| `docs/v3/ui-backlog.md` | Every UI item and its status |
| `docs/v3/open-questions.md` | Decisions still owed |
| `docs/v3/swipe-migration-audit.md` | **Untracked.** 28 behaviours depending on the current swipe, the money path, and a migration plan |
| `docs/v3/prototypes/swipe-gesture.html` | Working two-stage swipe prototype. Owner has tried it and approved the feel |
| `.superpowers/sdd/2026-08-17-v3-contract/progress.md` | Execution ledger: every ruling, every deferred finding. Gitignored — read it, it survives nothing else |

## 7. UI work: specced, not planned

Four pieces in spec §7. **None has an implementation plan yet** — an agent was writing one and died before producing it.

- **Ready to plan now:** market card status strip (the ×1.5 badge counting down to the next bracket), the user's own weight on the detail page, the price chart (`app/api/predictions/[id]/price-history` already serves the data and the OG image already renders one), the near-black-on-black materials, and archived markets still showing "22H LEFT" on the grid.
- **Gated on the prototype (now approved):** the two-stage swipe. `react-tinder-card` must be **replaced, not patched** — it reports only a final direction, so there is no position or velocity to build on. `motion`, `framer-motion` and `@react-spring/web` are all installed; pick one, drop two.
- **Gated on mockups that do not exist:** the desktop shell. Seven defects catalogued in spec §7.4.

**Buttons and keyboard are not a "preserve" job — they must be added.** The audit found no always-visible YES/NO control and no keyboard path; YES/NO live only inside the AI-analysis modal.

## 8. Traps this session actually hit — expect them again

1. **A green suite proves nothing.** Two tests passed while the thing they guarded was broken: the conservation test could not see the `exitEarly` weight bug (it drops position and pool by the same amount, so the aggregate stays consistent), and a refund test asserted only `platformFeeBalance`, never the refunds its name promised. Both were caught by deliberately breaking the code and checking the test failed.
2. **`lib/contract.ts` `require()`s a compiled artifact at build time**, and `artifacts/` is tracked in git for that reason. Rename or change the ABI and you must recompile and commit `artifacts/contracts/PredictionMarket_V3.sol/`. Local builds pass regardless because the file sits on disk untracked — **only a clean clone catches it.** This already broke one Vercel build.
3. **Test timestamps drift.** `registerPrediction` mines its own block, so deriving `createdAt` from the deadline is off by a second and flips quarter-boundary assertions. Read it from `market.predictions(id)`.
4. **Test counts are per file.** `npx hardhat test` runs three files. The V3 file's own count is what plans quote; use `npx hardhat test test/PredictionMarket_V3.test.js`.
5. **`minBet` is 1,000,000** (1 token at 6 decimals). Test amounts below it revert and can make a test unrunnable as written.
