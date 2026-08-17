# Handoff — 2026-08-17

State at the end of two long sessions. Read this before touching anything.

---

## 1. Where the code is

| Branch | Head | Contains |
|---|---|---|
| `main` | `84c0f1e` | Everything. V3 merged in, all UI fixes, all docs, both plans, the spec, the production fix, the landmine fix |
| `v3-contract` | `af7f0e1` | The V3 contract branch, now merged into `main`. 72 passing / 13 pending |

**Both branches are pushed.** `main` is production and Vercel deploys from it; `v3-contract` triggers a Vercel *preview* build, which is how a build break got caught once (see §5).

Today's eight commits were rewritten once, to strip a `Co-Authored-By: Claude` trailer that should never have been there (see `CLAUDE.md`). Trees were verified byte-identical before and after, so only messages changed. Hashes quoted anywhere older than `c30f249` are unaffected; the eight that moved are `0f716d7` `01d9186` `4cc299a` `117da66` `af7f0e1` `883c3e1` `73335a8` `84c0f1e`.

## 2. The landmine is disarmed — and the mechanism recorded here was wrong

`4cc299a` on `main` closes it. Read this section anyway, because the *reason* it was dangerous is not the reason the previous handoff gave, and the wrong version will lead the next person straight back into it.

**What the fix does.** `lib/chains` now exports `isWritableMarket(key, target)`. The swipe-bet path refuses unless the address it is about to write to *is* the selected chain's market contract. `CONTRACTS.V2.address` — Base's V2, a module-load constant that does not follow the switcher — can never equal a chain's pool address, so the swipe bet stays shut until V3 routes both the address **and the ABI** through `lib/chains`. Mutation-proved three ways; see the commit message.

**What the previous handoff got wrong.** It said setting `ROBINHOOD_USDG_DUALPOOL` arms the mine. It does not, and cannot:

> `ROBINHOOD_USDG_DUALPOOL`, `ROBINHOOD_TESTNET_USDG_DUALPOOL` and `ROBINHOOD_TESTNET_MOCK_USDC` have **no `NEXT_PUBLIC_` prefix**, so Next.js leaves them `undefined` in the browser bundle. Every contract address the client actually uses today (`NEXT_PUBLIC_CONTRACT_V2_ADDRESS`, `NEXT_PUBLIC_USDC_DUALPOOL_CONTRACT`, `NEXT_PUBLIC_SWIPE_CLAIM_CONTRACT`) is prefixed. The Robinhood ones are not.

Verified against a production build, not reasoned about: the values of `ROBINHOOD_TESTNET_USDG_DUALPOOL` and `ROBINHOOD_TESTNET_MOCK_USDC` — both of which `.env.local` **does** set — appear in **zero** client chunks, while `NEXT_PUBLIC_CONTRACT_V2_ADDRESS`'s value appears in three, and `lib/chains` is demonstrably bundled (its hardcoded USDG literal is in the same three chunks).

Two consequences, both live:

1. **`getWritableMarket()` already answers the same question two different ways** depending on where it runs. On the server `robinhoodTestnet` has a real pool address; in the UI it has the zero address. Anything that branches on it server-side and client-side is comparing different worlds.
2. **The mine was armed not by setting that env var but by the obvious next move.** Someone wires V3 up, betting is still refused, they find the address is `undefined` in the browser, and they prefix the var with `NEXT_PUBLIC_`. *That* is the moment the address becomes reachable. The address-comparison guard is what has to be sound before then, and now is.

Both config sites in `lib/chains/index.ts` carry this note in a comment.

**Still true, still the rule:** do not push the fix *and* make a Robinhood pool address client-visible in the same sitting.

**Two more call sites with the same shape, not armed.** `KalshiMarkets.tsx:875` and `CreatePredictionModal.tsx:523` both call `isReadOnlyChain()` with **no argument** — the exact bug §4.1 fixed in `TinderCard` — so they evaluate Base and refuse everything regardless of the selected chain. Neither is armed by any env var, and `CreatePredictionModal` additionally pins `chainId: ACTIVE_CHAIN_ID` on its writes. But whoever makes them chain-aware must use `isWritableMarket`, not `getWritableMarket`, or they will rebuild the mine in a new place.

`artifacts/` and `cache/` churn is pre-existing noise from hardhat runs — leave it. It does not block a branch switch except for `artifacts/contracts/PredictionMarket_V3.sol/`, which only exists on `v3-contract`; `git checkout -- ` that directory first. The churn is line endings only — verified the committed V3 artifact matches a fresh compile byte for byte in abi, bytecode and deployedBytecode.

## 3. What V3 actually is now

The contract is `contracts/PredictionMarket_V3.sol` (renamed from `PredictionMarket_USDG_DualPool`).

**Two mechanics were designed. Only one shipped.**

- ✅ **Time-weighted stakes.** A bet's weight is frozen at bet time by which quarter of the market's lifetime it lands in: ×1.50 / ×1.25 / ×1.00. It decides how the losing pool is split. Stake always returns raw; only the share of the losers is weighted. `exitEarly` removes weight proportionally, rounded **up**, against the exiting user.
- ❌ **Creator bond — designed, built, then removed.** Three commits build it, one removes it. History kept deliberately, because the reason it went is worth reading (§5).

Plus: an `exitEarly` guard against a real exploit — read §4.3 before you rely on the description of that exploit — and a deploy script applying platform fee 3%, `minBet` 0.1, on hardcoded collateral addresses.

**Nothing V3 is deployed anywhere.** Checked on-chain, not read off a doc: none of Base's V2 (`0x2bA3…`), Base's USDC dual pool (`0xf5Fa…`), the Robinhood testnet USDG pool (`0x3225…`) or the Robinhood testnet dual pool (`0x81B9…`) carries the `weightBpsAt` selector, which only V3 has. Robinhood **mainnet** has no market contract at all. What is on the Robinhood testnet is V3's audited *predecessor*; `rules-v3.md` §2 used to imply it was V3 and no longer does.

## 4. Next steps, in order

### 4.1 ✅ Done — the TinderCard production fix and the landmine

`0f716d7` (chain-aware guard, honest toast) and `4cc299a` (address-comparison guard) are both on `main` and pushed. What follows is kept as the record of what they fixed.

Two production bugs, both found by the audit:

1. **`handleStakeBet` calls `isReadOnlyChain()` with no argument** (`TinderCard.tsx` ~line 1058). That defaults to Base, which is `readOnly: true`, so *every* swipe-driven bet is refused regardless of the chain the user selected. `useActiveChain().isReadOnly` is the chain-aware version and is already used in `ChainSwitcher.tsx` and `app/prediction/[id]/page.tsx`. **This is a launch blocker: after V3 deploys, betting would still be refused.**
2. **The "Stake Accepted" toast fires on drag release** — before the dialog, before any signature, before any transaction. It tells the user something happened when nothing has.

**The trap in fixing #1:** making the check chain-aware must not turn "always blocked" into "attempts a write against the zero address". Robinhood mainnet has no market contract configured. Verify `getWritableMarket()` returning `null` still refuses the bet.

### 4.2 ✅ Done — the bond and the false claim are out of the docs

Fixed on **`v3-contract`** (`117da66`), not on `main`, for two reasons: the corrected §4 pointer names `contracts/PredictionMarket_V3.sol`, which only exists on that branch, and both `rules-v3.md` and the spec already had newer content there, so editing `main`'s copies would have meant merging two rewrites of a document that seeds user-facing copy. They reached `main` with the merge in §4.4, which is done.

What changed: §5.4 removed from `rules-v3.md` and §5.5/§5.6 renumbered; bond rows dropped from the spec's decisions table, rollout phases, risk table and open questions; spec §5.3 rewritten as a record of *why* the bond went; `open-questions.md` items 2–5 closed; a "executed, and partly reversed" banner on the plan, whose body is left intact because it is the record of what was actually done; a line in `worklog.md` saying two of the four adopted rule families did not survive the day.

The false claim — *"a market that pays out necessarily had stake on both sides"* — is deleted, and where it did damage it is recorded **as false**, with the counterexample and with what it cost: the bond's "one side stayed empty → forfeited" row would never have fired when the empty side was the losing one. It survived two reviews because the only test written against it staked YES and resolved NO, the one sub-case where the claim holds. The spec's §9 test list now demands both directions.

It still exists, quoted, in `docs/superpowers/plans/2026-08-17-v3-contract.md` — including inside quoted contract comments. That is deliberate: the plan is the record of what was implemented, and the banner tells the reader not to copy from it.

### 4.3 ✅ Done — scoped re-review of `7a6a4ad..48b411a`

Three commits: the bond removal + exploit guard (`e8eb4eb`), the narrowing to the final quarter (`48b411a`), and a prototype restyle (`3729959`, cosmetic). Result: **the contract code is sound. One test was not.**

**Fixed (`af7f0e1`).** `refuses the exit at the three-quarter mark` passed identically against `elapsed * 4 > window * 3` and the `>=` the contract has — the one assertion whose whole purpose was the exact boundary could not see the boundary move. Cause: `openMarket` asks for `DAY` but `registerPrediction` mines its own block, so the real span is 86399, and `ceil(86399 * 3 / 4)` overshoots the boundary by three units, putting the test at a point where both operators agree. Now pinned with `evm_setNextBlockTimestamp` to an exact span of `DAY`, with the mirror assertion one second earlier and an assertion that `span % 4 == 0` so it cannot become unreachable again.

**Mutation proofs, five against the reviewed code:**

| Mutation | Caught by |
|---|---|
| Guard made unconditional | 3 tests (both before-quarter exits, sole-backer full exit) |
| Guard removed | 2 tests (both refusals) |
| `>=` weakened to `>` | **0 before `af7f0e1`**, 1 after |
| `- amount > 0` weakened to `>= 0` | 2 tests (both refusals) |
| Partial exit wipes the whole weight | 1 test — the lower bound `e8eb4eb` added |

**Finding that is not a code bug and needs a decision: the exploit is misdescribed.** The spec and `rules-v3.md` say a bettor can "turn a stake they were about to lose into a full refund". Measured on-chain instead of argued — bob holds 500 on NO and 1 on YES as the sole YES backer:

| | bob stays in | bob exits his 1 YES |
|---|---|---|
| A third party holds 300 on the losing side | bob **+288**, third party **−300** | bob **−0.05**, third party **0** |
| bob alone in the market | bob **−7.50** (the fees) | bob **−0.05** |

For bob's 500 to be "certainly lost", someone else must be positioned to win it — and if anyone else is on the winning side, bob cannot empty that pool at all. Being the *sole* holder of the winning side means bob is about to collect the entire net losing pool, so exiting **costs him 288** and *refunds the third party who would otherwise have lost everything*. Exiting only pays when bob is the only participant, and what it recovers is the platform + creator fee on his own stake (7.50 of 501 at the contract's 1% default; ~3.5% at the intended 3%).

So the guard protects **fee revenue in self-dealt markets**, not user funds — and it charges a real cost to honest users: the sole backer of a side cannot exit at all in the final quarter, in markets that average nought to two players. The code is conservative and harmless; the *justification* in `rules-v3.md` §5.5 is player-facing copy that tells players a threat story that cannot happen to them. **Decide whether the guard is worth keeping on those terms, and fix that copy either way.** Not changed here: reversing it is a design decision, not a review finding.

Also confirmed: no bond remnant anywhere in `contracts/`, `scripts/deploy_v3.js` or the V3 test file; the deploy script's bond configuration is cleanly removed; the committed artifact matches a fresh compile byte for byte in abi, bytecode and deployedBytecode — which matters because `lib/contract.ts:1677` `require()`s that exact file at build time.

### 4.4 ✅ Done — `v3-contract` merged into `main`

Merge commit `84c0f1e`, no conflicts, `docs/v3/open-questions.md` auto-merged. Verified after merging: `npx tsc --noEmit` clean, `npx vitest run` 64/64, `npx hardhat test` 72 passing / 13 pending, `npm run build` exit 0, and `docs/v3/HANDOFF.md` plus `docs/v3/ui-backlog.md` both still present. The build check is not optional here: `lib/contract.ts` `require()`s the V3 artifact, and the rename means the merge is the moment that reference changes.

### 4.5 ✅ Done — V3 is live on Base mainnet

| | |
|---|---|
| Address | [`0x4753685Af9b317db5690E036AeBD4337627A070E`](https://basescan.org/address/0x4753685Af9b317db5690E036AeBD4337627A070E) |
| Owner and first resolver | `0xD4885A5aa53446843CABcDE1F35DE9b4E906030e` |
| Collateral | Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, confirmed 6 decimals |
| Config on-chain | `platformFee` 300, `creatorFee` 50, `earlyExitFee` 500, `minBet` 100000 |
| Verified | Yes. `PredictionMarket_V3`, solc `v0.8.20+commit.a1b79de6`, optimizer 200 runs, BUSL-1.1 source |
| Cost | ~0.0000145 ETH of a 0.002879 ETH balance |

Read back from three independent RPC endpoints, not from the deploy log.

Two things went wrong and are worth knowing:

1. **The launch configuration only half applied.** `setPlatformFee` landed, then `setMinBet` was refused with `in-flight transaction limit reached for delegated accounts`. The deployer is an EIP-7702 delegated account and the public Base RPC caps concurrent transactions from one. Re-sent on its own afterwards and it went through. If the deploy script is used again, it should send its configuration transactions one at a time with a confirmation between them, and it should re-read and report the final values rather than assuming its own writes stuck.
2. **A read straight after a write lied.** `minBet` still returned `1000000` immediately after the successful `setMinBet`, because the endpoint answered from a node that had not caught the block. The receipt said status 1 and 29083 gas, which is a real storage write. Trust the receipt, then re-read on more than one endpoint.

`BASE_RPC_URL` in `.env.local` points at the public node, which rate-limits plain view calls. `NEXT_PUBLIC_INFURA_BASE_ENDPOINT` and `NEXT_PUBLIC_BASE_RPC_URL` are keyed and reliable. Prefer those for anything scripted.

The deployer is the same address Vercel now has in `NEXT_PUBLIC_ADMIN_1`, and it is **not** the compromised `0xF1fa2002…` that owns the old Base contracts. Local `.env.local` still has the old value there, so local dev disagrees with production until that is fixed.

`npm run deploy:v3:base` is the command. Collateral addresses are hardcoded on purpose: searching Robinhood Chain's explorer for "USDC" returns 18-decimal impostors with no liquidity. The script refuses any token not reporting 6 decimals and any network it has no vetted address for.

### 4.6 ⚠️ Next: wire the app to V3, and read this before flipping Base

**A deployed contract does not turn betting on.** The address-comparison guard (§2) refuses every write until Base's V3 address and the V3 ABI both come through `lib/chains`. That is deliberate.

**The trap in the obvious first step.** Base is `readOnly: true` in the chain registry because its old contracts are archived. Making Base writable is not a one-line change, because four other places branch on that flag and two of them are writes at the *old* addresses:

- `KalshiMarkets.tsx:875` gates `handlePlaceBet` on `isReadOnlyChain()` and then writes to `USDC_DUALPOOL_CONTRACT_ADDRESS`, the archived pool owned by the lost key. Flip Base to writable and that guard opens onto a contract nobody controls.
- `CreatePredictionModal.tsx:523` gates market creation the same way and writes to `CONTRACTS.V2`.
- `app/prediction/[id]/page.tsx` and `ReadOnlyNotice.tsx` use the flag for the "Archived market" copy, which would silently disappear from genuinely archived markets.

So the order matters: **convert those guards to `isWritableMarket(chainKey, target)` first, prove them with a deliberate break, and only then give Base a writable market address.** A per-chain `readOnly` boolean cannot describe a chain with one live contract and two archived ones, which is what Base now is.

Then the real work: V3 takes `placeBet(uint256, bool, uint256)` in USDC with an ERC-20 approval, while `TinderCard`'s stake path is built around `placeStake` / `placeStakeWithToken` in ETH and $SWIPE. Amounts move to 6 decimals and the floor becomes 0.1 USDC. Markets also have to be registered on the new contract by the resolver before anything is bettable.

There is deliberately no `deploy:v3:robinhood` **npm script** — but that is all the "Base first" sequencing is made of. `scripts/deploy_v3.js` has a vetted `robinhood` entry in its `COLLATERAL` map and `hardhat.config.js` defines a `robinhood` mainnet network, so `npx hardhat run scripts/deploy_v3.js --network robinhood` would deploy V3 to Robinhood mainnet today. If that ordering is meant to be enforced rather than merely intended, the script has to refuse the network, not just lack an alias.

`npm run deploy:v3:base`. Collateral addresses are hardcoded on purpose: searching Robinhood Chain's explorer for "USDC" returns 18-decimal impostors with no liquidity. The script also refuses any token not reporting 6 decimals, and refuses any network it has no vetted address for.

There is deliberately no `deploy:v3:robinhood` **npm script** — but that is all the "Base first" sequencing is made of. `scripts/deploy_v3.js` has a vetted `robinhood` entry in its `COLLATERAL` map and `hardhat.config.js` defines a `robinhood` mainnet network, so `npx hardhat run scripts/deploy_v3.js --network robinhood` would deploy V3 to Robinhood mainnet today. If that ordering is meant to be enforced rather than merely intended, the script has to refuse the network, not just lack an alias.

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
| **`exitEarly` guard only in the final quarter** | Unconditional, it stranded the sole backer of a side — the *normal* case in markets averaging 0–2 players, i.e. exactly the early users the ×1.50 bonus exists to attract. Accepted residual: an outcome certain early could still be escaped. **Re-litigate this one:** §4.3 measured what the guard actually protects, and it is not what the decision was made on. |
| **Base first, Robinhood after** | Robinhood needs Redis key namespacing first. |
| **USDC only at launch; WETH later** | Two collaterals against a 12-market cap means six markets each, working against the concentration the whole design is for. |
| **Token does not block the contract** | V3 is collateralised in USDC and has no `$SWIPE` dependency. Only the fee rebate and the frozen gamification screens wait on the token. |

**Open and unresolved:**

1. **The token is planned for Robinhood while the markets are on Base.** That splits the reward loop — a user betting on Base would have to bridge to collect a rebate, and most will not. Three ways out are written up in `docs/v3/ui-backlog.md`. Decide before the token ships.
2. **Push, or hold?** Five local commits: three on `main` (production), two on `v3-contract`. Nothing is pushed. Pushing `main` deploys.
3. **Is the `exitEarly` final-quarter guard worth its cost?** §4.3 measured what it actually protects. Either keep it and rewrite the player-facing justification in `rules-v3.md` §5.5, or drop it. Both need the copy fixed.
4. **Should `deploy_v3.js` refuse `--network robinhood`?** §4.5. "Base first" is currently a missing npm alias, not a gate.

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

1. **A green suite proves nothing.** Now **three** times: the conservation test could not see the `exitEarly` weight bug (it drops position and pool by the same amount, so the aggregate stays consistent); a refund test asserted only `platformFeeBalance`, never the refunds its name promised; and `refuses the exit at the three-quarter mark` could not tell `>=` from `>` at the boundary it was named after (§4.3). Every one was caught by deliberately breaking the code and checking the test failed, and by nothing else. **This is not a suggestion. Break it on purpose or you have not tested it.**

   The same discipline applies to *claims*, not just tests. The landmine's stated mechanism (§2) was wrong and survived a whole handoff; it took a production build and a grep of the client chunks to find out. The exploit behind the `exitEarly` guard (§4.3) was wrong the same way and took an on-chain measurement of both branches. If a claim is load-bearing, run it.

2. **A non-`NEXT_PUBLIC_` env var read in client code is `undefined` in the browser, silently.** `lib/chains/index.ts` reads three Robinhood addresses that way, so the server and the UI see different chain configs — a real, live split, not a hypothetical. Anything that decides where money goes must not be the thing that discovers this. See §2.

3. **`ceil()` on a span that is not divisible by 4 does not land on the boundary.** `registerPrediction` mines its own block, so a market asked for `DAY` has a span of 86399, and `ceil(span * 3 / 4)` overshoots the guard's comparison by three units. A "boundary" test built that way is satisfied by both `>=` and `>`. Pin the registration block's timestamp with `evm_setNextBlockTimestamp` when a test's subject *is* a boundary.
4. **`lib/contract.ts` `require()`s a compiled artifact at build time** (line 1677, `PredictionMarket_V3.json`), and `artifacts/` is tracked in git for that reason. Rename or change the ABI and you must recompile and commit `artifacts/contracts/PredictionMarket_V3.sol/`. Local builds pass regardless because the file sits on disk untracked — **only a clean clone catches it.** This already broke one Vercel build.
5. **Test timestamps drift.** `registerPrediction` mines its own block, so deriving `createdAt` from the deadline is off by a second and flips quarter-boundary assertions. Read it from `market.predictions(id)` — and see trap 3 for when reading it is still not enough.
6. **Test counts are per file.** `npx hardhat test` runs three files. The V3 file's own count is what plans quote; use `npx hardhat test test/PredictionMarket_V3.test.js`. Current: 39 in that file, 72 passing / 13 pending overall.
7. **`minBet` is 1,000,000** (1 token at 6 decimals). Test amounts below it revert and can make a test unrunnable as written.
8. **The contract's constructor defaults are not the launch rates.** `platformFee` is 1% in the contract and 3% only after `deploy_v3.js` runs `setPlatformFee`. A test or a calculation done against a freshly deployed contract is measuring 1%, not the intended rate — which is why the §4.3 table shows 7.50 of fees where 3% would give 17.50.
