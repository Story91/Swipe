# 🎁 Daily Tasks - Implementation Guide

## ✅ Overview

Daily Tasks system that rewards users with SWIPE tokens for daily engagement. Designed to generate many daily transactions and increase user retention.

---

## 📋 What Was Implemented

### 1. **Smart Contract: SwipeDailyRewards.sol**
- **Location:** `contracts/SwipeDailyRewards.sol`
- **Features:**
  - ✅ Daily claims with 24h cooldown
  - ✅ Streak system with bonuses (up to +1500 SWIPE at 15 days)
  - ✅ 5% jackpot chance (5000 SWIPE)
  - ✅ Daily tasks with signature verification
  - ✅ One-time achievements
  - ✅ Referral system (2000 SWIPE each)
  - ✅ Admin controls (pause, enable/disable, emergency withdraw)

### 2. **React Component: DailyTasks.tsx**
- **Location:** `app/components/Tasks/DailyTasks.tsx`
- **Features:**
  - ✅ Beautiful UI with animations
  - ✅ Real-time countdown timer
  - ✅ Streak fire effects (intensity based on streak)
  - ✅ Task completion tracking
  - ✅ Achievement badges
  - ✅ Referral link copying
  - ✅ Pool statistics
  - ✅ Confetti celebration on claim

### 3. **Styling: DailyTasks.css**
- **Location:** `app/components/Tasks/DailyTasks.css`
- **Features:**
  - ✅ Dark theme with yellow-green accents
  - ✅ Pulse animations
  - ✅ Fire glow effects for streaks
  - ✅ Responsive design
  - ✅ Confetti animation

### 4. **API Routes**
- **Location:** `app/api/daily-tasks/`
- **Endpoints:**
  - `POST /api/daily-tasks/verify` - Verify task completion, return signature
  - `GET /api/daily-tasks/stats` - Get global statistics
  - `POST /api/daily-tasks/stats` - Update stats (internal)

### 5. **Deployment Scripts**
- `scripts/deploy_SwipeDailyRewards.js` - Deploy contract
- `scripts/fund_daily_rewards.js` - Fund contract with SWIPE

---

## 💰 Reward Structure

### Base Daily Claim
| Streak Days | Base Reward | Streak Bonus | Total |
|-------------|-------------|--------------|-------|
| Day 1       | 50,000 SWIPE   | +10,000 SWIPE   | 60,000 SWIPE |
| Day 7       | 50,000 SWIPE   | +70,000 SWIPE   | 120,000 SWIPE |
| Day 10+     | 50,000 SWIPE   | +100,000 SWIPE  | 150,000 SWIPE |

**Plus:** 5% chance for 250,000 SWIPE jackpot!

### Daily Tasks (Reset every 24h)
| Task | Reward | Description |
|------|--------|-------------|
| Share Cast | +50,000 SWIPE | Post on Farcaster with @swipeai |
| Create Prediction | +75,000 SWIPE | Submit a new prediction |
| Trading Volume | +100,000 SWIPE | Trade >500 SWIPE |

### Achievements (One-time)
| Achievement | Reward | Requirement |
|-------------|--------|-------------|
| Beta Tester | 500,000 SWIPE | Verified beta tester |
| Social Fan | 100,000 SWIPE | Follow all socials |
| 7-Day Streak | 250,000 SWIPE | Claim 7 days in a row |
| 30-Day Legend | 1,000,000 SWIPE | Claim 30 days in a row |

### Referrals
- **Both users get:** 150,000 SWIPE each
- Referrer must be an active user (has claimed at least once)

---

## 📊 Economics

With 250M SWIPE pool and 75 average daily users:

| Activity | Daily Cost |
|----------|-----------|
| Base claims (75 × 50k) | 3,750,000 SWIPE |
| Streak bonuses (avg 5 days) | ~3,750,000 SWIPE |
| Tasks (50% participation) | ~5,000,000 SWIPE |
| **Total Daily** | ~12,500,000 SWIPE |

**Program Duration:** 250M ÷ 12.5M = **~20 days** at full capacity

With 25 users daily: ~4.2M SWIPE/day = **~60 days**

⚠️ Note: These are generous rewards - adjust based on actual user engagement!

---

## 🚀 Deployment Steps

### 1. Deploy Contract
```bash
npx hardhat run scripts/deploy_SwipeDailyRewards.js --network base
```

### 2. Fund Contract
```bash
DAILY_REWARDS_CONTRACT=0x... FUND_AMOUNT=250000000 npx hardhat run scripts/fund_daily_rewards.js --network base
```

### 3. Update Environment Variables
```env
NEXT_PUBLIC_DAILY_REWARDS_CONTRACT=0x...
TASK_VERIFIER_PRIVATE_KEY=0x...
BETA_TESTERS=0x...,0x...
```

### 4. Verify on Basescan
```bash
npx hardhat verify --network base <contract_address> <swipe_token> <verifier_address>
```

---

## 🔧 Technical Details

### Contract Constants
```solidity
BASE_DAILY_REWARD = 50_000 * 10**18;      // 50,000 SWIPE
STREAK_BONUS_PER_DAY = 10_000 * 10**18;   // +10,000 per day
MAX_STREAK_BONUS_DAYS = 10;               // Cap at 10 days (+100k max)
JACKPOT_AMOUNT = 250_000 * 10**18;        // 250,000 SWIPE
JACKPOT_CHANCE = 5;                        // 5%
```

### Task Verification Flow
1. User completes task (e.g., shares cast)
2. Frontend calls `/api/daily-tasks/verify` with proof
3. Backend verifies via Neynar API (Farcaster) or database
4. Backend signs message: `keccak256(user, taskType, currentDay)`
5. User calls `completeTask(taskType, signature)` on contract
6. Contract verifies signature and sends reward

### Security
- **Reentrancy Protection:** State updated before transfers
- **Signature Replay Prevention:** Day included in message hash
- **Admin Controls:** Pausable, claiming toggle, emergency withdraw
- **Ownership:** Transferable ownership

---

## 🎨 UI Components

### Streak Fire Effects
```css
.fire-warm    { /* 3+ days */ }
.fire-hot     { /* 7+ days */ }
.fire-epic    { /* 15+ days */ }
.fire-legendary { /* 30+ days */ }
```

### Confetti Celebration
- 50 particles with random colors
- Triggered on successful claim
- 3-second animation

---

## 📱 Menu Integration

Added "🎁 Tasks" button in main navigation:
- Orange-to-yellow gradient background
- Positioned after "$SWIPE" menu item
- Links to `daily-tasks` dashboard

---

## 🔗 External Integrations

### Farcaster (Neynar API)
- Verify cast mentions
- Check user follows
- Requires `NEYNAR_API_KEY`

### Redis
- Store task completion stats
- Leaderboard tracking
- User activity history

---

## 📈 Future Improvements

1. **Chainlink VRF** - True randomness for jackpot
2. **Dynamic Rewards** - Adjust based on participation
3. **Daily Pool Limits** - First 1000 users get 100%, later 75%
4. **Community Challenges** - If 1000+ claims, everyone gets +50%
5. **NFT Badges** - On-chain achievement badges
6. **Streak Insurance** - Pay SWIPE to protect streak

---

## 📞 Contract Addresses

| Contract | Address |
|----------|---------|
| SWIPE Token | `0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9` |
| SwipeDailyRewards | `TBD after deployment` |

---

**Created for Dexter App | Base Blockchain | SWIPE Token**

