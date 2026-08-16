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

### 2. Wiring the wallet picker

**Blocks:** users choosing a wallet. Right now `app/page.tsx:407` renders
OnchainKit's `<ConnectWallet>`, which connects with one connector.
`app/components/Wallet/WalletPicker.tsx` exists but nothing imports it.

Two ways to close it, and they are not equivalent:

- **Replace `<ConnectWallet>` with `<WalletPicker>`.** Real choice, but
  `<ConnectWallet>` also carries the avatar, the profile name and the
  `<WalletDropdown>` — all of that has to be rebuilt or the header regresses.
- **Keep `<ConnectWallet>`, add the picker as a secondary path.** Cheaper, no
  regression, but two connect buttons is a confusing header.

Its connector filter is also wrong and must be fixed first — see the worklog.

## Parameters, needed before the contract is final

### 3. Minimum pool threshold

The value, and whether it is one global number or set per market. Too low and it
changes nothing; too high and every market on a quiet week auto-refunds, which
reads to users as the platform being broken.

### 4. Cap on simultaneously open markets

The number, and where it is enforced. In the contract it is a real guarantee but
costs gas to track; in the market creation path it is trivial but is only a
convention.

### 5. Early-entry bracket boundaries for short markets

The ×1.50 bracket is "the first 24 hours". A market that is only open for two
hours has no such window. Options: brackets as fractions of the market's own
lifetime rather than absolute hours, or a minimum market duration.

### 6. Creator bond: size, and where a forfeited bond goes

Size has to be high enough to deter spam and low enough that a genuine creator
will risk it. Destination is a design choice with a real difference: to the
platform treasury it is revenue; added to the next market's pool it is a visible
bonus for players.

## Carried over, still unanswered

From [`2026-08-16-swipe-rebuild-design.md`](../superpowers/specs/2026-08-16-swipe-rebuild-design.md) §9:

- **Kalshi's terms** for mirroring markets and reusing settlement data.
- **Regulatory posture** — Robinhood Chain is permissionless but operated by a
  US-regulated broker-dealer, and prediction markets are a sensitive category.
- **Price adapter provider** — must return a *historical* price at a timestamp,
  not spot, or a late cron tick settles on the wrong number.
- **`NEXT_PUBLIC_WC_PROJECT_ID` on Vercel** — set locally, unverified in
  production, and `wagmi.ts` asserts it non-null.
