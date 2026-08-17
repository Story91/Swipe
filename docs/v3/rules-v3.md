# V3 rules

**Status:** in design. Sections marked 🔒 are decided; 🟡 are chosen in principle
with parameters still open; ⬜ are not yet designed.

This file is the source the Help & FAQ and the Manifesto will be rewritten from.
See [`README.md`](./README.md).

---

## 1. What Swipe is 🔒

A parimutuel prediction market. Users back YES or NO on a question with a
stablecoin. At the deadline the market resolves, and the winning side splits the
losing side's stake in proportion to what each person put in.

Parimutuel, not an AMM: **players bet against each other, never against the
house.** The platform holds no position and cannot lose or win on an outcome —
it takes a fee and nothing else. This was chosen deliberately over an
order-book or AMM design, which would require the platform to put capital at
risk in every market.

## 2. Collateral and chains 🔒

| Chain | Collateral | Status |
|---|---|---|
| Base | USDC (6 dec) | V3 target — the user base is here |
| Robinhood Chain | USDG (6 dec) `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | V3 target — deployed and verified on testnet |

Both chains run the same contract and the same rules. The app has a network
switcher; markets are per-chain and do not share liquidity.

Base is not abandoned. The old Base contracts are archived (see §8), but V3
returns to Base as a first-class chain.

## 3. Fees 🔒

**Fees come out of the losing pool only.** A winner always receives their full
stake back, plus a share of what the losers staked minus fees. There is no
market condition in which you predict correctly and receive less than you put
in.

| Fee | Rate | Taken from | Goes to |
|---|---|---|---|
| Platform | **3.0%** | losing pool | platform treasury |
| Creator | 0.5% | losing pool | whoever created the market, claimed on demand |
| Early exit | 5.0% | the exit value | platform treasury |

At 3% a winner keeps 97% of their winnings — still materially cheaper than
Betfair (5% of winnings) and far below a traditional parimutuel takeout
(15–20%). The rate was 1%, which over the whole of V2's history produced a
fraction of a per-mille of one ETH. Raising it needs no contract change:
`setPlatformFee` allows up to 5%.

A fee on *total volume* rather than on winnings was considered and rejected — it
cannot be expressed by the contract, it collapses on lopsided markets, and it
would break the promise above. See §6.1 of the design.

Fee rates are frozen per market at the moment it resolves, so a later rate
change cannot alter what an already-settled market pays out.

## 4. Safety rules 🔒

Every one of these is a fix for a finding in the
[security audit](../superpowers/specs/2026-08-17-usdc-dualpool-security-audit.md),
and all are implemented in `contracts/PredictionMarket_USDG_DualPool.sol`.

| Rule | Why it exists |
|---|---|
| **Nobody backed the winner → everyone is refunded** | The old contract paid the entire pool to the platform. That paid a dishonest resolver ~99.5% of every pool for picking the empty side. |
| **A market cannot resolve before its deadline** | The old contract let a resolver settle while betting was still open. |
| **Anyone can open refunds 30 days after an unresolved deadline** | Stakes must never depend on one key staying available. 33.7M SWIPE is permanently stranded in the old V2 contract for exactly this reason. |
| **Ownership transfers in two steps; resolvers are a separate revocable role** | The old contract had no ownership transfer at all — it was the deployer's forever. Automation now runs on a narrow hot key while ownership stays cold. |
| **Creator rewards are pulled, not pushed** | A creator who could not receive the token used to be able to block resolution for everyone in that market. |
| **Early exit retains exactly what it does not pay out** | The difference used to go untracked, creating "orphaned" balances — and a drain function written to collect them that could take user stakes. |

## 5. Market lifecycle rules 🟡

Chosen; parameters still open. These exist to solve a problem V2 had that was
never about security: **245 markets, 525 players, 0.391 ETH of volume.**
Liquidity was spread so thin that almost every market showed 0 players.

### 5.1 No minimum pool 🔒

**Considered and dropped.** A market that failed to reach a minimum pool would
have refunded everyone instead of paying out. It solved market sprawl a second
time — the cap below already does — while punishing users for having bet on a
quiet market.

The minimum *bet* drops to **0.1 USDC**, the contract's own floor. Effectively
"whatever you want", while still preventing the unbounded participant list that
dust bets would create.

### 5.2 Cap on simultaneously open markets 🔒

**At most 12 open at once**, rather than 245, enforced in the market creation
path rather than in the contract. `registerPrediction` is already
`onlyResolver`, so the backend physically controls how many markets exist; an
on-chain counter would add a storage write to every resolution and guarantee
nothing extra.

### 5.3 Early-entry bonus 🔒

Stake placed early counts for more when the losing pool is split. Backing a
question before it is obvious is what the market is for; V2 paid the same
whether you took a view three days out or three minutes out.

Three brackets, chosen over a smooth curve because a user can hold it in their
head and the UI can show a countdown to the next step-down. Brackets are **quarters of the market's own lifetime**, not fixed hours — one
rule that works for a two-hour market and a seven-day one alike:

| When the bet is placed | Weight |
|---|---|
| First quarter of the market's life | ×1.50 |
| Second quarter | ×1.25 |
| Second half | ×1.00 |

Payout becomes `(stake × weight) / (sum of winning weights) × net losing pool`,
plus the original stake back.

**This is zero-sum between players.** The losing pool does not grow — early
backers take a larger share of it and late backers a smaller one. It must never
be described to users as "everyone earns more".

Weight is frozen at the moment the bet is placed. Refunds always return the raw
stake, never the weighted amount.

### 5.4 Creator bond 🟡

Creating a market locks a bond from the creator's wallet. Because registration
is `onlyResolver`, the creator approves the bond first and the backend pulls it
when it registers the market — so the platform still decides what markets
exist, which it must, since every market is an obligation to resolve it.

| Outcome | Bond |
|---|---|
| Market resolved and paid out | Returned, plus the 0.5% creator fee |
| One side of the market stayed empty | **Forfeited** |
| Cancelled by the platform | Returned — not the creator's failure |
| Abandoned past the grace period | Returned — the platform's failure |

A market that pays out necessarily had stake on both sides, so this is one rule,
not four: **the bond comes back whenever the market was a real market.**

*Open: bond size (10 USDC is a proposal, not a researched number), and whether
the bond earns its place at all while creation stays platform-gated.*

### 5.5 Betting in ETH or USDC 🟡

Supported by deploying the same audited contract twice — once with USDC as
collateral, once with WETH — rather than by teaching one contract two
currencies. No new contract code and nothing new to audit.

Launching **USDC-only**: two collateral options against a 12-market cap would
mean six markets each, which cuts against the concentration everything above is
built around. WETH follows once a single market reliably fills.

*Open: whether the WETH wrap can be hidden inside the existing approval
sequence. If not, ETH betting should not ship — someone who asks to bet ETH must
not be handed a lesson about wrapped tokens.*

## 6. Rewards ⬜

Chosen in principle: **a share of the 1% platform fee returns to active users as
a rebate.**

Blocked on the token decision. The contract will expose a hook so the rebate can
be wired in without redeploying, but the accrual and payout mechanics get their
own design once the reward currency is known.

The old reward system — daily claims, 7/30-day streaks, jackpots, referrals,
achievements — is currently frozen behind "coming soon" overlays in the app,
because it paid in the old $SWIPE token whose fee stream is no longer reachable.
None of it is deleted, and the mechanics are worth carrying forward.

## 7. Market creation and resolution ⬜

Not yet designed for V3. The existing plan is in
[`2026-08-16-swipe-rebuild-design.md`](../superpowers/specs/2026-08-16-swipe-rebuild-design.md):
markets mirrored from Kalshi, resolved from a declared data source with an
evidence trail written before any transaction is sent.

## 8. What happened to the old markets 🔒

The Base markets created before V3 are **archived**: readable, but closed to new
bets. Past positions and results stay visible.

The user-facing framing is forward-looking and stays that way: V3 is safer and
pays out better, and that is the whole story a user needs. The engineering
detail behind the archive belongs in the audit document, not in product copy.
