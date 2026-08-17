# 🎯 Swipe — Betting on the Future

**Tinder-style prediction markets.** Swipe right for YES, left for NO, stake
crypto, win proportional rewards. Live today at [theswipe.app](https://theswipe.app)
on Base, with a Farcaster mini-app and a testnet deployment on Robinhood
Chain.

Most prediction-market projects that go open source stop at the protocol
layer — infrastructure other people build apps on top of. Swipe is going
open source as the app itself: the swipe interface, the market logic, the
staking and resolution contracts, all of it, starting now, not as a
someday promise.

## 📖 Open source & licensing

This repo is **not** single-licensed — three grants apply depending on the
directory. Full text and rationale in [`NOTICE`](NOTICE).

| Scope | Path | License |
|---|---|---|
| App, frontend, SDK | everything else | [MIT](LICENSE) |
| Smart contracts | [`contracts/`](contracts/) (excl. `contracts/mocks/`) | [BUSL-1.1](contracts/LICENSE) → converts to Apache-2.0 on **2030-08-17** |
| AI market-analysis assistant ("Swiper") | `app/components/AIAssistant/`, `app/api/ai-assistant/` | Proprietary — all rights reserved |

**Why BUSL for the contracts, not straight MIT?** The code is public and
auditable from day one — anyone can read it, test it, deploy it to a
testnet, or build tooling against it. What BUSL-1.1 blocks for a fixed
window is someone forking it verbatim and launching a competing hosted
prediction market next to us before the protocol has had a chance to
establish itself. It's the same model Uniswap v3 and Aave v3 shipped under.
The contracts convert automatically to Apache-2.0 on the Change Date above —
no action required, no strings attached after that.

**Why keep the AI assistant closed?** It's the one part of the stack that's
a genuine product differentiator right now (market analysis, not just a
swipe UI). Everything else — the interface, the SDK, the contracts — is
open. This isn't permanent; it's a call we made for the current stage of
the project, not a line in the sand.

**This is not legal advice.** Prediction markets that combine staking and
community-driven resolution sit in a regulatory grey area in several
jurisdictions, the US in particular. If you're deploying a fork
commercially, get your own compliance review — don't treat this README as
one.

## 🏛️ Governance

For now, Swipe is maintained by the core team: GitHub is open for issues
and PRs, but merge and release decisions sit with the core maintainers
while the protocol is young. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for
the workflow. We're not launching a DAO on day one — empty quorums and
governance theater are a well-worn failure mode — and we're not publishing
a longer-term governance plan here yet either. More on this later.

## 🔥 Features

### 🎮 User experience
- **Tinder-style interface** — swipe RIGHT for YES, LEFT for NO
- **Stake amount selection** — pick exactly how much to bet
- **Real-time odds** — live percentage view of betting pools
- **Weighted parimutuel payouts** — the losing pool splits across winners
  by stake and how early they bet, not a flat % for everyone (see Economic
  model below)
- **Manual reward claims** — pull-pattern for claiming winnings
- **AI-assisted market analysis** ("Swiper") — proprietary, see above

### 💰 Economic model (V3, the live generation)
Verified directly against the deployed contract on Base
([`0x5C40...CA4a`](https://basescan.org/address/0x5C4078BB24f352809B93FF395cA7655835D1CA4a#code)),
not just the source:
- **Parimutuel pools** — YES/NO stakes settle from the losing side's pool;
  there's no fixed payout table
- **3% platform fee + 0.5% creator fee**, both taken from the *losing*
  pool only, never from stakes — earlier versions took 1% from winners'
  profit instead, V3 changed the model, not just the number
- **Early-stake weighting** — bets from a market's first quarter get 1.5×
  weight when the losing pool is split, 1.25× in the second quarter, 1.0×
  after
- **No house-takes-all** — a market with no winners refunds everyone
  instead of handing the whole pool to the platform
- **Permissionless refund fallback** — any market still unresolved 30 days
  past its deadline becomes refundable to anyone, no privileged call
  required, so funds can never be stranded by a lost operational key
- **Early exit** — sell part of a position back before the deadline for a
  fee (5% at launch)

Legacy `PredictionMarket_V2.sol` and `PredictionMarket_USDC_DualPool.sol`
used the older ETH/USDC dual-pool model with a 1% winners'-profit fee; see
Architecture below for their current status.

### ⚙️ Market operations (V3)
V3 dropped the admin/whitelist/public creation tiers and the community
approval queue earlier versions had. The model is simpler:
- **Resolvers** — a role the contract owner grants or revokes
  (`setResolver`), deliberately separate and revocable from ownership, so
  day-to-day operations run on a narrow hot key while the owner key stays
  cold
- **Registration** — only resolvers (or the owner) can register a market
  (`registerPrediction` / `registerPredictionsBatch`) — there is no public
  or community-reviewed submission path on V3
- **Resolution** — only resolvers can resolve (`resolvePrediction`) or
  cancel (`cancelPrediction`) a market
- **Owner powers** — fee rates, minimum bet, resolver grants, and fee
  withdrawal (`setPlatformFee`, `setCreatorFee`, `setEarlyExitFee`,
  `setMinBet`, `withdrawPlatformFees`)

### 🔐 Access control
- **Role-based dashboards** in the frontend for different user types — this
  UI concept predates V3 and doesn't map 1:1 onto the roles above; treat it
  as a frontend permission layer, not the on-chain source of truth
- **Wallet-based auth** — dashboard access is driven by the connected
  wallet matching an env-configured address list
- **Admin Dashboard** — addresses in `NEXT_PUBLIC_ADMIN_1` (and `_2`, etc.)
- **Approver Dashboard** — addresses in `NEXT_PUBLIC_APPROVER_1..4`, or
  admins — relevant to the legacy V1/V2 markets it still manages, not to V3
- Unauthorized users are redirected to the User Dashboard automatically

## 🚀 Quick start

### 1. Install dependencies
```bash
npm install
```

### 2. Environment variables

Copy `.env.local.backup-20260816` (or start from scratch) to `.env.local` —
Next.js and Hardhat both read from it. Key variables:

```bash
# Deployment
PRIVATE_KEY=your_private_key_here            # no 0x prefix
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com
ROBINHOOD_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
ETHERSCAN_API_V2_KEY=your_etherscan_v2_key    # verification on Base

# Frontend — contract addresses (set the ones you've deployed)
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...            # V1
NEXT_PUBLIC_CONTRACT_V2_ADDRESS=0x...         # V2
NEXT_PUBLIC_USDC_DUALPOOL_CONTRACT=0x...      # USDC dual-pool market
NEXT_PUBLIC_SWIPE_CLAIM_CONTRACT=0x...
NEXT_PUBLIC_DAILY_REWARDS_V3_CONTRACT=0x...

# OnchainKit / mini-app
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_onchainkit_api_key
NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME=Swipe

# Access control (Base network addresses)
NEXT_PUBLIC_ADMIN_1=0x...
NEXT_PUBLIC_APPROVER_1=0x...
```

### 3. Deploy contracts
```bash
npm run compile              # hardhat compile, viaIR enabled by default
npm run deploy:v2            # PredictionMarketV2 → Base mainnet (see contracts/README.md)
npm run deploy:v2:sepolia    # PredictionMarketV2 → Base Sepolia
npm run deploy:usdc          # USDC dual-pool market → Base mainnet
npm run deploy:v3:testnet    # V3 → Robinhood Chain testnet
npm run deploy:v3:base       # V3 → Base mainnet
```

### 4. Run the app
```bash
npm run dev
```

### 5. Dashboards

Four views ship in the app: **Tinder Mode** (the swipe interface), **User
Dashboard** (portfolio, betting), **Admin Dashboard** (market management),
**Approver Dashboard** (moderation for the legacy V1/V2 markets it still
manages — V3 has no approval queue, see Market operations above).

## 🏗️ Architecture

### Smart contracts (`contracts/`, BUSL-1.1)
- **Solidity 0.8.19 / 0.8.20** with OpenZeppelin security primitives
  (`Ownable2Step`, `ReentrancyGuard`, `SafeERC20`)
- **V3 is the live generation** — parimutuel, resolver/owner-gated, 3%
  platform fee + 0.5% creator fee from the losing pool (see Economic model
  above), USDC on Base / USDG on Robinhood Chain
- **V1, V2, and the USDC dual-pool contract are archived, read-only legacy
  markets on Base** — the frontend keeps them browsable but routes no new
  writes to them
- **Permissionless refund fallback** on V3 — no market can be stranded by
  a lost resolver key
- Multiple deployed generations: `PredictionMarket_V2.sol`,
  `PredictionMarket_V3.sol`, `PredictionMarket_USDC_DualPool.sol`, plus
  `SwipeClaim.sol` and the `SwipeDailyRewards*` series for the Tasks system

### Frontend (MIT)
- **Next.js 15** with TypeScript
- **OnchainKit** for wallet integration and UI
- **Wagmi / Viem** for chain interactions
- **React Tinder Card** for the swipe gesture
- **Tailwind CSS** with a custom glassmorphism design
- **Farcaster mini-app** support (`minikit.config.ts`)
- Real-time updates via contract event listeners

### Networks
- **Base** (mainnet, chain id 8453) and **Base Sepolia** (84532) — primary
- **Robinhood Chain** (Arbitrum Orbit) — mainnet (4663) and testnet
  (46630), Blockscout-verified

### Key components
```
📁 contracts/
  ├── PredictionMarket_V2.sol
  ├── PredictionMarket_V3.sol           # current generation
  ├── PredictionMarket_USDC_DualPool.sol
  ├── SwipeClaim.sol
  ├── SwipeDailyRewards_V3.sol          # Tasks system
  └── mocks/MockUSDC.sol                # test-only, MIT

📁 app/components/Main/
  ├── TinderCard.tsx                    # swipe interface
  ├── UserDashboard.tsx
  ├── AdminDashboard.tsx
  └── ApproverDashboard.tsx

📁 app/components/AIAssistant/          # proprietary, see NOTICE
📁 app/api/ai-assistant/                # proprietary, see NOTICE

📁 scripts/
  └── deploy_*.js                       # per-network deploy scripts
```

## 🎯 Usage examples (V3)

### Register a market (resolver-only)
```javascript
await contract.registerPrediction(predictionId, creatorAddress, deadlineTimestamp);
```

### Place a bet
```javascript
await usdc.approve(contractAddress, amount);       // USDC, 6 decimals
await contract.placeBet(predictionId, true, amount); // true = YES
```

### Resolve a market (resolver-only)
```javascript
await contract.resolvePrediction(predictionId, true); // true = YES won
```

### Claim winnings
```javascript
await contract.claimWinnings(predictionId);
```

## ⚙️ Configuration

Owner-only setters, shown with the values actually live on Base as of
2026-08-17 (read directly from the deployed contract, not the source
defaults — the constructor defaults are lower and get overridden at
deploy time, see `scripts/deploy_v3.js`):

```solidity
contract.setPlatformFee(300);        // 3% of the losing pool
contract.setCreatorFee(50);          // 0.5% of the losing pool
contract.setEarlyExitFee(500);       // 5%, charged on early exits
contract.setMinBet(100_000);         // 0.1 USDC (6 decimals)
contract.setResolver(address, true); // grant/revoke the resolver role
```

## 📚 Documentation

- [Contract documentation](contracts/README.md) — full API reference
- [Approval flow diagram](docs/APPROVAL_FLOW_DIAGRAM.md)
- [Solidity docs](https://docs.soliditylang.org/) · [OpenZeppelin docs](https://docs.openzeppelin.com/)
- [OnchainKit docs](https://docs.base.org/builderkits/onchainkit/getting-started) · [Next.js docs](https://nextjs.org/docs) · [Wagmi docs](https://wagmi.sh/)
- [Hardhat docs](https://hardhat.org/docs) · [Base docs](https://docs.base.org/) · [BaseScan](https://basescan.org/)

## 🤝 Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow, current
governance phase, and what's in/out of scope for external PRs.

## 🔒 Security

Found a vulnerability, especially anything touching fund safety in the
contracts? See [`SECURITY.md`](SECURITY.md) — please don't file it as a
public issue.

## 📄 License

Three licenses apply depending on the directory — see the table above and
[`NOTICE`](NOTICE) for the full breakdown. Short version: app and SDK are
[MIT](LICENSE), contracts are [BUSL-1.1](contracts/LICENSE) converting to
Apache-2.0 in 2030, and the AI assistant is proprietary.

## ⚠️ Disclaimer

This is experimental software handling real funds. Nothing here is
financial, investment, or legal advice. Always test thoroughly on testnets
before touching mainnet, and do your own research — including your own
regulatory review — before deploying a fork commercially.
