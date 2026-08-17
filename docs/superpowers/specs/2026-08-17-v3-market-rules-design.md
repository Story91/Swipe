# Swipe V3 — market rules, economics, and the desktop shell

**Date:** 2026-08-17
**Status:** Design — awaiting review
**Supersedes:** §5 (market rules) of `2026-08-16-swipe-rebuild-design.md`. That
document's settlement, Kalshi-mirroring and chain-abstraction work stands
unchanged.

---

## 1. Context

V3's contract already exists: `contracts/PredictionMarket_USDG_DualPool.sol`,
audited, 17 tests, deployed and verified on Robinhood testnet. It fixes all 8
findings from the security audit. **This design is not about safety.** It is
about the problem the audit never touched:

> 245 markets. 525 players. 0.391 ETH of lifetime volume.

Nearly every market card showed "0 ETH · 0 players" and "YES 0% / NO 100%".
Liquidity was spread until nothing was alive. Separately, the platform's fee
take over that entire history was a fraction of a per-mille of one ETH — not a
thin margin, effectively no margin.

## 2. Goals

1. Concentrate liquidity so markets have visible activity.
2. Reward taking a view early, when it is worth something.
3. Give the platform a defensible margin.
4. Make the new rules legible in the UI — a rule nobody can see does not change
   behaviour.
5. Fix a desktop shell that currently looks broken.
6. Make the core interaction — the swipe — worth using the app for.

### Non-goals

- Replacing parimutuel with an AMM. Rejected: it needs platform capital in every
  market and a rewrite of audited code.
- Rebuilding the ETH + $SWIPE dual-pool. Deferred until the new token exists.
- Reward mechanics (streaks, jackpots, referrals). Blocked on the token; own
  spec.

## 3. Decisions

| Decision | Choice | Why |
|---|---|---|
| Payout model | **Parimutuel, unchanged** | Players bet each other, never the house. The platform holds no position and cannot lose on an outcome. |
| Chains | **Both, but sequenced: Base first, Robinhood after** | The user base is on Base, and Robinhood cannot go live until Redis keys are namespaced. Running both is the destination, not the first step. |
| Contract count | **One variant, deployed once per chain** | Not one instance across chains, which is impossible: a contract lives at one address on one chain, and `collateral` is immutable, so each deployment is bound to one token. What is rejected is a *second variant* sitting beside V3 on the same chain. Keeping a "safe V2" was considered and dropped: "winners take from losers" is the parimutuel model, not a V2 feature, and V3 has it identically. |
| Early-entry bonus | **Tiered ×1.50 / ×1.25 / ×1.00** | A user can hold three brackets in their head; a continuous curve they cannot compute. |
| Bracket boundaries | **Quarters of the market's own lifetime** | One rule for a 2-hour market and a 7-day one, with no special cases. |
| Minimum pool threshold | **Dropped** | It solved market sprawl a second time — the cap on open markets already does — while punishing users for betting on a quiet market. |
| `minBet` | **Lower to 0.1 USDC** (the contract floor) | Effectively "whatever you want", while still preventing the unbounded participant list that dust bets would create. |
| Cap on open markets | **12, enforced off-chain** | `registerPrediction` is already `onlyResolver`, so the backend physically controls how many exist. An on-chain counter adds a storage write per resolution and guarantees nothing extra. |
| Platform fee | **1% → 3%** of the losing pool | See §6. No contract change: `setPlatformFee` allows up to 5%. |
| Creator bond | **Designed, built, then removed** | It widened what the hot resolver key could reach and was defeated for one cent. See §5.3. |
| Rebate hook in contract | **No** | An unspecified extension point added to a freshly audited contract is exactly where the next audit finding comes from. A separate distributor pays rebates once the reward currency is known. |
| ETH **or** USDC markets | **Yes — by deploying the same contract twice** | See §5.4. No new contract code, no new audit surface. |
| Deployment order | **Base first**, Robinhood after | The users are on Base. Robinhood's dual-pool waits for the new token. |

---

## 4. What "winners take from losers" already means

Stated explicitly because it was nearly redesigned on a misunderstanding.

Fees come out of the **losing pool only**. A winner always receives their full
stake back plus a share of what the losers staked, minus fees. There is no
market condition in which a correct prediction returns less than it cost. This
is true in V2 and in V3, and nothing in this design changes it.

---

## 5. Contract changes

Base is the audited `PredictionMarket_USDG_DualPool`. Two additions.

### 5.1 Time-weighted stakes

**New state.** On `Prediction`: `weightedYesPool`, `weightedNoPool`,
`weightedWinnersPool`. On `Position`: `weightedYes`, `weightedNo`.

**Weight at bet time**, frozen — never recomputed:

```
window  = deadline - createdAt
elapsed = block.timestamp - createdAt

elapsed * 4 <  window  ->  15000   (first quarter,  x1.50)
elapsed * 2 <  window  ->  12500   (second quarter, x1.25)
otherwise              ->  10000   (second half,    x1.00)
```

Comparisons multiply rather than divide, so no integer division is involved in
choosing a bracket.

**`placeBet`** additionally accrues `amount * weight / 10000` into the position's
and the market's weighted pool.

**`resolvePrediction`** freezes `weightedWinnersPool` alongside the existing
`netLosersPool`, so later state cannot alter a settled market's payouts.

**`claimWinnings`**:

```
payout = winningStake
       + weightedWinningStake * netLosersPool / weightedWinnersPool
```

The stake returns raw; only the share of the losing pool is weighted. Summed
across winners the second term is exactly `netLosersPool`, minus integer dust
that stays in the contract as it does today.

**`claimRefund` is untouched** — refunds return `yesAmount + noAmount`, the raw
stake. A weighted refund would be a payout.

**`exitEarly` is the dangerous one.** It must remove weight in proportion to the
raw amount withdrawn:

```
weightedRemoved = ceil(heldWeighted * amount / held)
```

**Rounded up, deliberately.** Rounding down would let a partial exit leave the
user holding weight their remaining stake does not back — a slow leak paid for
by every other winner in that market. A full exit (`amount == held`) zeroes the
weight exactly.

#### What this does and does not do

The losing pool does not grow. Early backers take a larger share of the same
pool and late backers a smaller one. **It must never be presented to users as
"everyone earns more"** — it is a redistribution, someone will do the arithmetic,
and being caught overstating it costs more than the feature is worth.

#### `exitEarly` guard: only in the final quarter

The final security review before mainnet found that `exitEarly` could be used
to dodge a certain loss: stake 500 on NO and 1 on YES as the sole YES holder,
watch YES become certain, exit that single YES unit for pennies, `yesPool`
hits zero, resolution finds no winners, the market becomes refundable, and the
500 that was certainly lost comes back in full. The first fix made this
unconditional — no exit may reduce a non-empty pool to zero — but that also
blocks the sole backer of a side from exiting **at all**, and in this
product's markets (245 markets averaging nought to two players each) that is
the normal case, not an edge case. An unconditional guard removes early exit
for exactly the early users §5.1's ×1.50 bonus exists to attract.

The guard now applies **only in the final quarter of a market's lifetime**
(`elapsed * 4 >= window * 3`, the same multiply-not-divide comparison
`weightBpsAt` uses for its brackets). Earlier than that, anyone may exit,
including a sole backer, and a full exit can take a pool to zero. The exploit
depends on acting once the outcome is knowable, which is overwhelmingly late
in a market's life, so scoping the guard to the final quarter closes it in
practice while leaving early exit intact for the common case.

**Accepted residual risk.** An outcome that becomes certain early — a price
crossing its threshold with days still to run — can still be escaped before
the final quarter, recovering a stake that would otherwise have been forfeit.
This is a knowing trade against the alternative of stranding every sole
backer for a side's entire life, not an oversight.

### 5.2 Fee change

`setPlatformFee(300)`. Configuration, not code.

### 5.3 Creator bond — built, then removed

A refundable deposit, pulled from the creator when the market was registered.
It was designed here, implemented across three commits, and then removed in
full. The section stays because both reasons it failed are reusable.

**Why it went.**

1. **It widened what the hot key could reach.** `registerPrediction` is
   `onlyResolver` and the creator is a parameter, not `msg.sender`, so the bond
   had to be pulled with `safeTransferFrom` from an address that had only
   granted the contract an allowance. Every bettor grants that allowance. The
   resolver key could therefore move tokens out of any wallet holding one,
   without that address consenting to *that* transfer — which is the shape
   audit finding 8 is about. A hot key used by automation is the wrong place to
   add reach.
2. **It did not deter what it existed to deter.** The bond was forfeited only
   when a side stayed empty, so a creator who wash-bet the minimum on both
   sides — one cent — always got it back.

Blast radius bought for a mechanic that did not work.

**A false claim this design rested on, written down so it is not derived a
second time:**

> *"A market that pays out necessarily had stake on both sides."*

It is not true, and the bond's whole "one rule, not four" table was built on
it. With `yesPool = 100` and `noPool = 0`, resolving YES gives
`winnersPool > 0` and the paying path runs — on a market that only ever had one
side. Refunds need the *winning* side empty, not either side. So the table's
"one side stayed empty → forfeited" row would simply not have fired whenever
the empty side was the losing one, and the bond would have come back from a
market that was never a market.

The claim survived two per-task reviews because it sounds right, and because
the only test written against it (`forfeits the bond when one side stayed
empty`) staked YES and resolved NO — the sub-case where the empty side *wins*,
which is exactly the sub-case in which the claim happens to hold. Any future
rule that infers "this was a real market" from "it paid out" is inferring it
from a falsehood.

### 5.4 Betting in ETH or in USDC

The contract takes one `collateral` ERC-20, immutable, set in the constructor.
Supporting two currencies therefore has three possible shapes, and the cheapest
one is also the safest:

| Approach | Cost | Verdict |
|---|---|---|
| **Deploy the same contract twice — once with USDC, once with WETH** | Zero new contract code | **Chosen.** Nothing to audit that has not been audited |
| Native ETH support inside the contract | `payable` paths, a second accounting branch through every function | Rejected — new audit surface on the money path |
| One contract, many collaterals | Per-market collateral, per-collateral fee balances | Rejected — the largest change for the smallest gain |

So Base gets **two V3 deployments**: `V3-USDC` and `V3-WETH`. A market belongs to
one of them, and the card says which. The chain-config layer already models
contracts per chain; this extends it to contracts per collateral.

**The one thing this costs the user is wrapping.** WETH is an ERC-20; native ETH
is not. The bet flow must wrap in the same transaction sequence as the approval,
so "bet 0.01 ETH" never becomes a lesson about WETH. If that cannot be made
invisible, ship USDC first and add WETH when it can.

**Liquidity splits across deployments**, which cuts against the concentration
this design is built around. Two collateral options and 12 open markets means
six markets each. Recommend launching **USDC-only** and adding WETH once a
single market reliably attracts players.

---

## 6. Economics

Platform take is `platformFee × losersPool`, so as a share of total volume it
depends on how balanced the market is, peaking when the book is even:

| Market of 2,000 USDC | at 1% (today) | at 3% |
|---|---|---|
| Split 1240 / 760 | 7.60 | 22.80 |
| Split evenly | 10.00 | 30.00 |
| **Share of total volume** | **0.25 – 0.5%** | **0.75 – 1.5%** |

For reference: Betfair takes 5% of winnings, sports books run about 5% margin,
and a traditional parimutuel takeout is 15–20%. At 3% a winner keeps 97% of
their winnings, so this stays materially cheaper than every comparable venue
while ceasing to be a rounding error.

`setPlatformFee` caps at 5%, so 3% leaves headroom without a redeploy, and the
rate can be cut again if volume justifies it.

### 6.1 Why the fee is not "3% of total volume"

Considered and rejected. A flat share of volume is not the same instrument:

| Market of 2,000 USDC | 3% of winnings | 3% of volume |
|---|---|---|
| Split 1240 / 760 | 22.80 | 60.00 — **7.9% of the losing pool** |
| Split evenly | 30.00 | 60.00 — 6% of the losing pool |
| Split 1900 / 100 | 3.00 | 60.00 — **60% of the losing pool** |

1. **The contract cannot express it.** The fee is structurally a share of the
   losing pool, capped at 5%. Matching 3% of volume would need up to ~12% on
   lopsided markets — a new contract and a new audit.
2. **It collapses on lopsided books.** At 95/5 the platform would take 60% of
   what the winners won.
3. **It breaks the strongest user-facing promise** — that a correct prediction
   never returns less than it cost.

### 6.2 The rate is not the revenue problem

At 0.391 ETH of lifetime volume, 1%, 3% and 10% all round to nothing. **The
constraint is volume, not the rate.** The revenue lever in this design is §5.1
and the 12-market cap — concentration and a reason to enter early — not the
percentage. Revisit the rate after the first market with real volume, not
before.

---

## 7. UI

### 7.1 Market card — status strip

Two things change a user's decision and both must be visible without a click:
what they gain by entering now, and how alive the market is.

```
+-----------------------------------+
| [x1.5 EARLY] ---------- 4h 12m    |
| (icon) Will Bitcoin hit 72K...    |
|                                   |
| YES 62%                  NO 38%   |
| ############________              |
|                                   |
| 2,000 USDC · 47 players     22H   |
+-----------------------------------+
```

- Bonus badge with a live countdown **to the next bracket**, not to the
  deadline. When the bonus is spent the badge disappears rather than showing
  ×1.00, so an expired market is quiet instead of loudly average.
- Odds stay computed from raw pools. Weights affect payouts, never prices.

### 7.2 Market detail

- **The user's own weight**, stated plainly: "you entered at ×1.5".
- A one-sentence explanation of what the weight does, linked to the full rules.

### 7.3 Create-market modal

Nothing to add. With the bond removed (§5.3) creation asks for no approval and
locks no capital, so there is no disclosure the modal owes the creator.

### 7.4 Desktop shell — the swipe view

Currently the worst screen in the app. Seven distinct defects, from the
2026-08-17 01:42 capture:

1. **Nav pills overlap.** The `● Robinhood` chain switcher collides with the
   `Grid / Swipe` toggle — the toggle's edge visibly cuts into the pill.
2. **Three visual languages in one row**: black pills, a lime toggle, and emoji
   glyphs (`💵 USDC`, `🎁 Tasks`), inside roughly 500px.
3. **Three stacked rows of chrome** — Sign In, Menu, then the nav — none sharing
   an alignment, before any content appears.
4. **The centre column is ~900px wide and about 15% full.** A logo and two lines
   of text float in it with several hundred pixels of dead space beneath.
5. **The background watermark is clipped by the column edges**, so the script
   lettering and phone mockup read as a rendering fault rather than decoration.
6. **Both side rails are top-aligned with one card each** and a long void below.
7. **Nothing shares a grid.** Centred nav over centred content over left-aligned
   rails, with no common measure.

Direction — deliberately not a redesign of the brand:

- **One chrome row.** Wallet, chain, view toggle and menu on a single line with
  consistent spacing and one pill treatment. Chain and view toggle are different
  kinds of control and must stop looking like siblings crammed together.
- **A real grid.** Rails and centre column share column edges and a top
  baseline, so the eye has something to align to.
- **Fill or shrink the centre column.** For the disconnected state, the connect
  prompt becomes a genuine panel — what Swipe is, what a market looks like, one
  call to action — rather than two lines adrift in a void.
- **The watermark either bleeds full width behind everything or is removed.**
  Clipped at a column edge is the one thing it cannot do.

*This section is direction, not a finished visual design. It needs its own
mockup pass before implementation.*

### 7.5 Prediction detail page

From the 2026-08-17 02:08 capture, and partly fixed already:

- **Archived markets no longer advertise bets.** A Base V2 market with a future
  deadline rendered a live countdown and a "Place Your Bet" button that was not
  a bet at all — it deep-linked to the home screen, so on an archived chain it
  dropped the user there with no explanation. Fixed in `b7281d5`. **The same
  zombie state still exists on the market grid**, where archived cards show
  "22H LEFT". Same treatment needed there.
- **No chart, though the data exists.** `app/api/predictions/[id]/price-history`
  already serves it and the OG image renders one. The detail page is the one
  place a user has asked to see it and does not.
- **The page is near-black wall to wall**, with a single dark panel on a black
  field. It reads as heavy and unfinished. Direction: give the panel a material
  of its own — a lighter translucent surface with a real edge — so it sits *on*
  the background rather than dissolving into it, and let the brand lime carry
  accents instead of the entire visual load.

### 7.6 The swipe gesture

The user's request: swipe once to pick a side, then swipe again to commit —
"ultra modern, like Tinder". The current implementation cannot deliver that, and
the reason is structural.

**What is wrong today.** `react-tinder-card` reports only a final direction via
`onSwipe(dir)`. A recogniser that emits a completed gesture throws away the
continuous tracking every good gesture is built on: there is no position, no
velocity, and no way to give feedback *during* the drag or to let the user
change their mind mid-flight. Meanwhile `framer-motion`, `motion` and
`@react-spring/web` are all already in `package.json` and none of them is used
for this.

**Replace it with a Motion-driven gesture.** One library, dropping
`react-tinder-card` and two of the three animation packages.

#### Two stages, one axis

| Stage | Gesture | Result |
|---|---|---|
| Neutral | Drag | Card tracks the finger 1:1; the YES or NO side tints in proportion to distance |
| → Armed | Release past threshold, or flick | Card **docks to the side instead of flying away**, revealing stake chips. Light haptic |
| Armed | Swipe **the same direction again** | Bet commits. Card flies off with the release velocity |
| Armed | Swipe **the opposite direction** | Disarms, card springs back to centre |

Same direction twice commits; the opposite direction cancels. It is learnable in
one attempt and it is physical — nothing to read.

Betting is money, so a single flick must not spend it. But the second stage is a
gesture, not a modal: no dialog, no confirm button, no interruption of flow.

#### Mechanics

- **Pointer Events with `setPointerCapture`**, respecting the grab offset —
  never snap the card centre to the finger.
- **~10px hysteresis** before committing to a direction, then 1:1 tracking.
- **Project the landing point from velocity** rather than snapping from the
  release position, so a flick genuinely throws the card:
  `current + (v/1000)·d/(1−d)` with `d ≈ 0.998`.
- **Hand the release velocity to the spring**, so there is no seam between drag
  and animation.
- **Interruptible throughout.** A card mid-flight must be grabbable and
  reversible, animating from its live on-screen transform, never from the target.
- **Rubber-band at the edges** when armed, instead of stopping dead.
- **X and Y as independent springs** — a single spring on 2D distance desyncs.

| Motion | Damping | Response |
|---|---|---|
| Return to centre (no momentum) | 1.0 | 0.30 |
| Dock to armed (momentum) | 0.8 | 0.35 |
| Commit fly-off | 1.0 | 0.40 |

Bounce only where a flick preceded the motion. A card that merely returns to
centre should not overshoot.

#### Feedback

Haptics on **arm** (a light tap) and on **commit** (a firmer confirmation) via
the Vibration API, fired on the same frame as the visual — a lagged haptic is
worse than none. Nothing on the drag itself; continuous buzzing trains people to
ignore all of it.

#### Non-negotiables

- **Buttons stay.** The gesture is an accelerator, never the only path. Desktop,
  keyboard and assistive-technology users need explicit YES/NO/stake controls
  with real focus states.
- **`prefers-reduced-motion`**: cross-fade the stage change instead of springing,
  and keep the two-stage semantics — tap to arm, tap to confirm.
- **The armed state must survive a re-render.** Losing it mid-bet because a
  price poll returned is the sort of bug that costs a user real money.

*This needs an interactive prototype before it is written into the app. An
interactive demo is worth a million static mockups here, because the whole thing
is feel — and it also sets the bar that stops the final implementation drifting
into mediocrity.*

---

## 8. Rollout

| Phase | Deliverable | Gate |
|---|---|---|
| 1 | Weighted stakes in the contract, with tests | Full suite green, including the boundary cases in §9 |
| 2 | Redis key namespacing | **Precondition for two live chains**, which is where this ends up |
| 3 | Deploy V3-USDC to Robinhood testnet, then **Base mainnet** | Verified on each explorer |
| 4 | Fee to 3%, `minBet` to 0.1, cap of 12 in the creation path | — |
| 5 | Card status strip, detail weight | — |
| 6 | Prediction detail page: chart, materials | — |
| 7 | Swipe gesture | Interactive prototype approved first |
| 8 | Desktop shell | Own mockup pass first |
| 9 | Robinhood mainnet | Phase 2 complete |
| 10 | V3-WETH on Base | Only once one market reliably attracts players (§5.4) |
| — | Robinhood dual-pool with the new token | Blocked on the token |

**Base goes first.** The users are there. Robinhood follows once the keys are
namespaced, and its dual-pool waits for the token.

Phases 5–8 are independent of 1–4 and can run in parallel. Phases 7 and 8 each
need a prototype or mockup pass before any code.

---

## 9. Testing

The weighting changes payout arithmetic in a contract that was just audited, so
it carries the burden of proof.

**Brackets:** a bet in the first block; at exactly 25% and exactly 50% of the
window on both sides of the boundary; in the final block. A two-hour market and
a seven-day market must follow the same rule.

**Conservation — the property that matters:** for any mix of stakes, weights and
partial exits, the sum of all payouts must never exceed `winnersPool +
netLosersPool`. Worth driving with random inputs rather than hand-picked cases.

**`exitEarly`:** partial exit then claim, checking the exiting user's remaining
weight is proportional and rounding favoured the pool; full exit zeroing weight
exactly; exit followed by a fresh bet at a later bracket.

**One-sided markets, both ways round:** the empty side wins (no winners,
refundable) *and* the empty side loses (the paying path runs on a market that
only ever had one side). The second is the case §5.3's false claim hid, and it
is easy to leave untested because the first one feels like it covers it.

**Refunds:** raw stake returned, never weighted — for every refundable path.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Weighting introduces a payout bug in audited code | Conservation tested as a property, not by examples. Weighting is the only change to payout maths and is confined to two functions |
| `exitEarly` rounding leaks value | Rounding is up, against the exiting user, by construction. Explicitly tested |
| Redis namespacing corrupts production | Dual-read, backfill, verify, retire. Own phase, own rollback |
| 3% deters users at launch | Rate is settable to 5% or back to 1% with no redeploy |
| Users read weighting as "everyone earns more" | Copy states the redistribution plainly. §5.1 |
| Replacing the swipe library regresses the one thing that works | Prototype before replacing; buttons remain a full path throughout, so the gesture is never the only way to bet |
| Two collateral deployments halve liquidity per market | Launch USDC-only; WETH waits for evidence that one market fills (§5.4) |
| Two-stage swipe reads as friction, not safety | The second stage is a gesture on the same axis, never a dialog. If testing says otherwise, arming can become opt-in above a stake size |

---

## 11. Open questions

1. **The new $SWIPE token** — blocks the fee rebate and every screen currently
   behind a "coming soon" overlay. A holder snapshot exists at
   `docs/swipe-holder-snapshot-50065584.json`.
2. **Desktop shell** needs a mockup pass before anyone writes CSS.
3. **The swipe gesture needs an interactive prototype**, not a written spec, as
   its real approval gate. §7.6 fixes the mechanics; whether the two-stage
   gesture feels good can only be judged by using it.
6. **Can ETH betting hide the WETH wrap?** If wrapping cannot be folded into the
   existing approval sequence invisibly, V3-WETH should not ship — a user who
   asked to bet ETH must never be handed a lesson about wrapped tokens.
7. **Quick-stake amounts** for the armed swipe state. Fixed chips (1 / 5 / 25)
   or scaled to the user's balance — undecided, and it changes how the armed
   state is laid out.
8. Carried over from the 2026-08-16 design: Kalshi's terms, regulatory posture,
   the historical price source, and `NEXT_PUBLIC_WC_PROJECT_ID` on Vercel.
