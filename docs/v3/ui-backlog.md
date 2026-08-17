# UI backlog

Every UI item raised in the 2026-08-17 session, with where it stands. Nothing
here is invented — each line traces to something asked for directly.

Status: ✅ shipped to `main` · 📋 specced, no plan yet · 🔒 blocked

---

## ✅ Shipped and on `main`

| Item | Commit |
|---|---|
| Archive banner: forward-looking V3 copy, no incident narrative; full width on desktop instead of a 70ch paragraph in a wide box | `98974c8` |
| Wallet choice actually works — MetaMask and every EIP-6963 wallet reachable, not Coinbase only | `5e7526f` |
| Real wallet brand marks instead of emoji; Base Account moved down the menu | `612c63b` |
| Double-encoded emoji repaired in the create-prediction modal — the garbled characters in the share text and the creator labels | `2a9a27b` |
| Archived markets stop offering bets: the fake "Place Your Bet" that dropped users on the home screen is gone, and the countdown reads "Archived" | `b7281d5` |

## 📋 Specced, still needs a plan

All four are written up in
[`../superpowers/specs/2026-08-17-v3-market-rules-design.md`](../superpowers/specs/2026-08-17-v3-market-rules-design.md).
The contract has an implementation plan; **these do not yet**.

### Market card status strip — spec §7.1

The bonus badge with a countdown to the next bracket, and pool state. Two
things change a user's decision and both must be visible without a click.

### Prediction detail page — spec §7.5

- **The price chart.** `app/api/predictions/[id]/price-history` already serves
  the data and the OG image renders a chart. The detail page is the one place
  someone asked to see it and it is not there.
- **The near-black wall.** A dark panel on a black field reads as heavy and
  unfinished. The panel needs a material of its own so it sits *on* the
  background rather than dissolving into it.
- **Zombie countdowns still exist on the market grid.** The detail page was
  fixed in `b7281d5`; archived cards in the grid still show "22H LEFT".

### Two-stage swipe — spec §7.6

Swipe once to pick a side, the card docks instead of flying away, swipe the
same direction again to commit, the opposite direction to cancel. Springs,
velocity handoff, momentum projection and haptics are all specified with
concrete values.

`react-tinder-card` must be **replaced, not patched**: it reports only a final
direction, so there is no position or velocity to build a two-stage gesture on.
`motion`, `framer-motion` and `@react-spring/web` are all already installed and
none is used for this.

**Gate: an interactive prototype before any code.** Gesture feel is judged with
a finger, not by reading a spec.

### Desktop shell — spec §7.4

Seven distinct defects catalogued from the 01:42 capture: the chain pill
colliding with the Grid/Swipe toggle, three visual languages in one row, three
stacked rows of chrome sharing no alignment, a ~900px centre column about 15%
full, a watermark clipped by the column edge so it reads as a rendering fault,
and two side rails holding one card each above a long void.

**Gate: a mockup pass before any CSS.**

## 🔒 Blocked

| Item | Blocked on |
|---|---|
| Fee rebate for active users | The new $SWIPE token |
| Daily claims, streaks, jackpots, referrals, achievements — currently behind "coming soon" overlays | The new $SWIPE token |
| Robinhood dual-pool markets | The new $SWIPE token |

---

## Sequencing: the token does not block the contract

Raised in session and worth stating plainly, because it looks circular and is
not.

**V3 is collateralised in USDC. It has no dependency on $SWIPE.** The contract
can ship to Base and take real bets before the token exists.

The dependency runs one way, and only into the reward layer: the rebate and the
frozen gamification screens wait on the token. Nothing else does.

The reverse order is the one that fails. **A token launched before the contract
is live brings users to a product with nothing to do** — and on Robinhood
Chain, nothing to do at all. So: contract first, token second, rewards third.

---

## Also outstanding, not UI

- **`NEXT_PUBLIC_WC_PROJECT_ID` on Vercel** — set locally, unverified in
  production. `wagmi.ts:53` asserts it non-null, and `getConfig()` builds every
  connector at mount, so if it is unset there the throw takes wallet connection
  down entirely rather than just WalletConnect.
- **Help & FAQ, the manifesto, and `USDC_MARKETS_GUIDE.md` all still describe
  V2** and get rewritten from [`rules-v3.md`](./rules-v3.md) once the rules are
  frozen. See [`README.md`](./README.md).
