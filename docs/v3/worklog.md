# Worklog

Newest first. Records what changed and what is still broken — a log that only
records successes is not worth keeping.

---

## 2026-08-17

### Shipped

- **Archive banner rewritten and widened.** Copy is forward-looking ("we are
  building V3 — safer, better payouts") instead of explaining the old contracts.
  It names no destination chain, because V3 has not committed to one. On desktop
  the label and the sentence now sit on one row and use the full width; it was a
  70ch paragraph in a box spanning the whole grid. (`98974c8`)
- **Three commits pushed that had never left the machine** — `cc81f66`,
  `564049a`, `98974c8`. The previous session reported main as synced; it was
  three commits ahead of origin. Production had therefore never built the Sign In
  fix, which is why wallet connection still appeared broken.

### Found, not yet fixed

- **`WalletPicker` is dead code.** `95ff025` added a wallet chooser, but nothing
  renders it. `app/page.tsx:407` still uses OnchainKit's `<ConnectWallet>`, which
  connects with a single connector. Users still get no choice of wallet. See
  [`open-questions.md`](./open-questions.md).
- **`WalletPicker`'s availability filter is wrong.** Line 59 reads
  `c.type !== 'injected' || c.id === 'injected'`. The comment says it hides
  wallets that are not installed; it does not do that. What it actually does is
  drop every injected connector whose id is not literally `injected` — which
  removes EIP-6963-discovered wallets like MetaMask, and the Farcaster connector.
  It must be fixed before the picker is wired in.
- **`NEXT_PUBLIC_WC_PROJECT_ID` is set locally but unverified on Vercel.**
  `wagmi.ts:53` passes it to the WalletConnect connector with a non-null
  assertion. Unset in production, connector construction is the failure point —
  and `getConfig()` builds every connector at mount, so one throwing takes wallet
  connection down entirely, not just WalletConnect.

### Decided (design session)

- V3 targets **Base and Robinhood Chain in parallel**, not one or the other.
  This promotes the Redis key namespacing migration from "risky, later" to a
  precondition — two chains cannot share chain-agnostic keys.
- **Parimutuel stays.** AMM/CPMM rejected: it would require platform capital in
  every market and a rewrite of audited code.
- Four new rule families adopted: minimum pool threshold, cap on open markets,
  early-entry bonus, creator bond. Plus a fee rebate, blocked on the token.
- Early-entry bonus uses **three brackets** (×1.50 / ×1.25 / ×1.00) rather than a
  linear curve — a user can compute it mentally and the UI can count down to the
  next step.

### Context established

- The real V2 failure was not only the key loss. **245 markets, 525 players,
  0.391 ETH total volume**: liquidity spread until nearly every market showed
  "0 players". §5 of [`rules-v3.md`](./rules-v3.md) exists to attack that.
- The audited successor contract already exists and is deployed to Robinhood
  testnet: `contracts/PredictionMarket_USDG_DualPool.sol`, 8 audit findings
  fixed.

---

## Before 2026-08-17

Carried over from earlier sessions, for continuity:

- Security audit of the USDC dual-pool contract — 7 findings, 2 critical.
  → `docs/superpowers/specs/2026-08-17-usdc-dualpool-security-audit.md`
- Successor contract written with every finding fixed, plus 17 tests. Deployed
  and verified on Robinhood testnet.
- Performance: predictions snapshot prebuilt in Redis (73s → 0.33s), bundle down
  53%, claims-count poll no longer scans the keyspace.
- Admin authorisation moved server-side: wallet signature recovered and checked
  against a server-only allowlist, replacing a client-side
  `NEXT_PUBLIC_ADMIN_1 === address` render gate.
- Network switcher, wallet picker component, blurred "coming soon" overlays over
  the screens that depended on the old $SWIPE token.
- Writes refused on archived chains in the app rather than left to fail on-chain.
