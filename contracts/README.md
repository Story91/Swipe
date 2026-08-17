# Smart contracts

## 📋 Overview

`PredictionMarket_V3.sol` is the current, live contract — a parimutuel
YES/NO prediction market collateralized by a 6-decimal stablecoin (USDC on
Base, USDG on Robinhood Chain). It's the successor to
`PredictionMarket_USDC_DualPool.sol`, and every behavioral change from that
predecessor is a fix for a specific finding from an internal security
review (no house-takes-all branch, a permissionless refund fallback, fixed
payout accounting, resolver/owner separation — see the contract's own
top-of-file comment for the full list).

`PredictionMarket_V2.sol` and `PredictionMarket_USDC_DualPool.sol` are
earlier generations, still deployed and still readable on Base, but not
where new development happens — see [Legacy contracts](#legacy-contracts-v2--usdc-dual-pool)
below.

## 🚀 V3: current generation

Verified live on Base:
[`0x4753...070E`](https://basescan.org/address/0x4753685Af9b317db5690E036AeBD4337627A070E#code).
Values below are read directly from that deployment, not just the source —
the constructor defaults are lower and get overridden at deploy time by
`scripts/deploy_v3.js`, which is the actual launch configuration.

### Roles

V3 has two roles, deliberately separate:

- **Owner** (`Ownable2Step`) — sets fee rates and the minimum bet, grants
  or revokes resolvers, withdraws accumulated platform fees, rescues
  foreign tokens sent to the contract by mistake. Meant to stay a cold key.
- **Resolver** (`mapping(address => bool) public resolvers`, managed by
  `setResolver`) — registers markets and resolves or cancels them. The
  owner always counts as a resolver too. Meant to be a narrow hot key so
  day-to-day operations don't need the cold key.

There is no admin/whitelist/public creation tiers and no community
approval queue in V3 — that model belonged to V1/V2. Markets are
registered exclusively by resolvers; there's no public or
community-reviewed submission path.

### Live parameters (Base, verified 2026-08-17)

| Parameter | Value | Notes |
|---|---|---|
| `platformFee` | 300 (3%) | of the **losing** pool |
| `creatorFee` | 50 (0.5%) | of the losing pool, credited to whoever registered the market |
| `earlyExitFee` | 500 (5%) | charged on `exitEarly` |
| `minBet` | 100000 (0.1 USDC) | 6 decimals |
| `owner` / first resolver | `0xD4885...030e` | a fresh key, unrelated to the legacy contracts' archived owner |
| `collateral` | `0x8335...C913` | USDC on Base |

Constructor defaults differ from the above (`platformFee` starts at 1%,
`earlyExitFee` at 5%, `minBet` at 1 USDC) — they're overridden immediately
after deploy so the source stays identical across networks while policy
varies per launch. Don't read the constructor and assume it's live; read
the contract, or `scripts/deploy_v3.js` for what a given deploy applies.

### Core functions

```solidity
// Resolver-only — register a market (no public creation path in V3)
function registerPrediction(uint256 predictionId, address creator, uint256 deadline) external;
function registerPredictionsBatch(uint256[] calldata predictionIds, address[] calldata creators, uint256[] calldata deadlines) external;

// Public — place or exit a position
function placeBet(uint256 predictionId, bool isYes, uint256 amount) external;
function exitEarly(uint256 predictionId, bool isYes, uint256 amount) external;

// Resolver-only — settle a market
function resolvePrediction(uint256 predictionId, bool outcome) external;
function cancelPrediction(uint256 predictionId, string calldata reason) external;

// Public — opens once a market is 30 days past its deadline and still unresolved
function enableRefundsAfterGrace(uint256 predictionId) external;

// Public — claim
function claimWinnings(uint256 predictionId) external;
function claimRefund(uint256 predictionId) external;
function claimCreatorReward() external;

// Owner-only — configuration
function setResolver(address resolver, bool enabled) external;
function setPlatformFee(uint256 newFee) external;
function setCreatorFee(uint256 newFee) external;
function setEarlyExitFee(uint256 newFee) external;
function setMinBet(uint256 newMinBet) external;
function withdrawPlatformFees(address to) external;
function rescueForeignToken(address token, address to, uint256 amount) external;
```

### View functions

```solidity
function getPrediction(uint256 predictionId) external view returns (
    bool registered, address creator, uint256 deadline,
    uint256 yesPool, uint256 noPool,
    bool resolved, bool cancelled, bool outcome, bool refundable,
    uint256 participantCount
);

function getPrices(uint256 predictionId) external view returns (uint256 yesPrice, uint256 noPrice);
function getParticipants(uint256 predictionId) external view returns (address[] memory);
function getFeeConfig() external view returns (uint256 platform, uint256 creator, uint256 exit, uint256 minimumBet);

// Stake weight at a given timestamp — 1.5x first quarter of the market's
// window, 1.25x second quarter, 1.0x after. Brackets are fractions of the
// market's own window, not fixed hours.
function weightBpsAt(uint256 predictionId, uint256 timestamp) public view returns (uint256);
```

## 🎯 Usage examples

### Register a market
```javascript
await contract.registerPrediction(predictionId, creatorAddress, deadlineTimestamp);
```

### Place a bet
```javascript
await usdc.approve(contractAddress, amount); // USDC, 6 decimals
await contract.placeBet(predictionId, true, amount); // true = YES
```

### Resolve a market
```javascript
await contract.resolvePrediction(predictionId, true); // true = YES won
```

### Claim winnings
```javascript
await contract.claimWinnings(predictionId);
```

## 💰 Fee mechanics

Both fees come out of the **losing** side's pool only, at resolution —
winners' stakes and the winning pool are never touched:

```
losersPool = the pool that bet the wrong way
platformFeeAmount = losersPool * 3%
creatorReward      = losersPool * 0.5%   → credited to whoever registered the market
netLosersPool      = losersPool - platformFeeAmount - creatorReward

winner's payout = their stake back
                 + their share of netLosersPool,
                   weighted by (their weighted stake / total weighted winning stake)
```

If nobody backed the winning side, there's no house-takes-all branch — the
whole market becomes refundable instead, and everyone gets their stake
back.

## 🛡️ Security features

- **`Ownable2Step`** — ownership transfer requires the new owner to accept,
  so a typo'd address can't brick ownership
- **`ReentrancyGuard`** on every function that moves funds
- **`SafeERC20`** throughout for the collateral token
- **Resolver/owner separation** — a compromised resolver hot key can be
  revoked by the owner without touching ownership
- **Permissionless refund fallback** (`enableRefundsAfterGrace`) — 30 days
  past a market's deadline, anyone can open refunds if it's still
  unresolved; stakes don't depend on any one key staying available
- **Fixed payout accounting** — `netLosersPool` and the winning side's
  weighted pool are computed once at resolution and stored, so a later fee
  change can't alter what an already-resolved market pays out

## 🛠️ Deployment

### Prerequisites
```bash
npm install
cp .env.local.backup-20260816 .env.local  # or start from scratch — see README for keys
```

### Deploy V3
```bash
npm run deploy:v3:testnet    # Robinhood Chain testnet
npm run deploy:v3:base       # Base mainnet
```

`scripts/deploy_v3.js` deploys the contract, then immediately calls
`setPlatformFee(300)` and `setMinBet(100_000)` — that's the actual launch
configuration; the constructor defaults are not it. Verify after deploy
with the command the script prints.

### Deploy legacy contracts
```bash
npm run deploy:v2            # PredictionMarketV2 (ETH + SWIPE pools) → Base mainnet
npm run deploy:v2:sepolia    # PredictionMarketV2 → Base Sepolia
npm run deploy:usdc          # USDC dual-pool market → Base mainnet
```

> `scripts/deploy.js` is deprecated — it deployed the since-removed
> `PredictionMarket_Optimized.sol`. Base Goerli is also discontinued;
> use Base Sepolia for testing.

## Legacy contracts: V2 & USDC dual pool

`PredictionMarket_V2.sol` and `PredictionMarket_USDC_DualPool.sol` predate
the resolver/owner split and the permissionless refund fallback described
above. They used a 1% platform fee taken from winners' profit (not the
losing pool), a `createPrediction`/`setApprover`/multi-tier approval
model, and native ETH or a two-token ETH+SWIPE pool instead of a single
stablecoin.

On Base, these are kept readable for historical positions but the frontend
does not route new writes to them — treat them as archived, not as
something to build new integrations against. If you're integrating
against Swipe, target V3.

## 📞 Support

Questions about the contracts: open an issue at
[github.com/Story91/Swipe](https://github.com/Story91/Swipe). Vulnerability
reports: see [`SECURITY.md`](../SECURITY.md), not a public issue.
