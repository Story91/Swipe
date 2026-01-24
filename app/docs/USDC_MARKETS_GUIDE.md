# USDC Markets - User Guide

## What are USDC Markets?

USDC Markets is a new prediction market system that uses **USDC (stablecoin)** instead of ETH or SWIPE. This allows you to bet with dollars without worrying about crypto price volatility.

### Key Differences from ETH/SWIPE Pool

| Feature | ETH/SWIPE Pool | USDC Pool |
|---------|----------------|-----------|
| Currency | ETH or SWIPE | USDC (stablecoin) |
| Minimum Bet | 0.0001 ETH | $1 USDC |
| Exit Early | ❌ No | ✅ Yes (5% fee) |
| Creator Rewards | ❌ No | ✅ 0.5% |
| Platform Fee | 1% | 1% |
| AMM Pricing | ❌ No | ✅ Yes |

---

## How AMM Pricing Works

USDC Markets use an **Automated Market Maker (AMM)** to determine YES/NO prices dynamically based on pool sizes.

### Price Formula

```
YES Price = NO Pool / (YES Pool + NO Pool)
NO Price = YES Pool / (YES Pool + NO Pool)
```

### Example: Understanding Prices

**Scenario:** A prediction has:
- YES Pool: $1,000 USDC
- NO Pool: $500 USDC
- Total Pool: $1,500 USDC

**Prices:**
- YES Price = 500 / 1500 = **0.33 ($0.33 per share)**
- NO Price = 1000 / 1500 = **0.67 ($0.67 per share)**

**What this means:**
- If you believe YES will win, you can buy YES shares cheap at $0.33
- If YES wins, each share pays out $1.00 (you profit $0.67 per share!)
- If NO wins, you lose your $0.33 per share

---

## Complete Example: USDC Prediction

### 📊 Prediction: "Will ETH reach $5,000 by March 2025?"

**Initial Pools:**
| Pool | Amount | Participants |
|------|--------|--------------|
| YES | $1,000 USDC | Alice: $500, Bob: $300, Charlie: $200 |
| NO | $600 USDC | David: $400, Eve: $200 |
| **Total** | **$1,600 USDC** | |

**Initial Prices:**
- YES: $0.375 per share (600/1600)
- NO: $0.625 per share (1000/1600)

---

### ✅ Outcome: YES wins!

**Fee Breakdown (from losers' pool of $600):**
| Fee Type | Percentage | Amount |
|----------|------------|--------|
| Platform Fee | 1% | $6.00 |
| Creator Reward | 0.5% | $3.00 |
| **Total Fees** | **1.5%** | **$9.00** |

**Net Losers Pool:** $600 - $9 = **$591 USDC**

---

### 💰 Payouts for Winners

**Alice** (50% of YES pool):
- Stake: $500 USDC
- Share of losers pool: (500/1000) × $591 = **$295.50**
- **Total Payout: $795.50 USDC**
- **Profit: +$295.50 (+59.1%)**

**Bob** (30% of YES pool):
- Stake: $300 USDC
- Share of losers pool: (300/1000) × $591 = **$177.30**
- **Total Payout: $477.30 USDC**
- **Profit: +$177.30 (+59.1%)**

**Charlie** (20% of YES pool):
- Stake: $200 USDC
- Share of losers pool: (200/1000) × $591 = **$118.20**
- **Total Payout: $318.20 USDC**
- **Profit: +$118.20 (+59.1%)**

---

### ❌ Losers

**David:** Loses $400 USDC (entire stake)
**Eve:** Loses $200 USDC (entire stake)

---

## Early Exit Feature (Unique to USDC)

Unlike ETH/SWIPE pools, you can **exit your position early** before the prediction is resolved!

### How Early Exit Works

1. You have a position in a prediction
2. Before deadline, you can sell your position back to the pool
3. A **5% exit fee** is deducted from your position value
4. The rest is returned to you in USDC

### Early Exit Example

**Your Position:**
- You bought $100 worth of YES shares
- Current pool odds changed, your position is now worth $150
- You want to exit early

**Exit Calculation:**
- Position Value: $150
- Exit Fee (5%): $7.50
- **You Receive: $142.50 USDC**

**When to Exit Early:**
- ✅ When you're in profit and want to lock it in
- ✅ When market sentiment changes against your position
- ✅ When you need your USDC for something else
- ❌ Don't exit if you're confident in your prediction winning!

---

## Fee Structure

### At Resolution (Winners)
| Fee | Percentage | Description |
|-----|------------|-------------|
| Platform Fee | 1% | Taken from losers' pool |
| Creator Reward | 0.5% | Goes to prediction creator |
| **Total** | **1.5%** | Deducted before distribution |

### Early Exit
| Fee | Percentage | Description |
|-----|------------|-------------|
| Exit Fee | 5% | Deducted from your position value |

---

## Key Differences Summary

### Advantages of USDC Markets
1. **Stable Value** - No crypto volatility, bet in dollars
2. **Early Exit** - Can leave positions anytime (with 5% fee)
3. **Dynamic Pricing** - AMM adjusts prices based on demand
4. **Creator Rewards** - Prediction creators earn 0.5%

### Things to Know
1. **Minimum Bet: $1 USDC** - You need at least $1 to participate
2. **Same Predictions** - USDC pools exist alongside ETH/SWIPE pools
3. **Same Resolution** - Both pools resolve with the same outcome
4. **Independent Pools** - Your USDC bet doesn't affect ETH/SWIPE pool

---

## How to Bet with USDC

1. **Go to USDC Markets** - Click the "💵 USDC" button in the menu
2. **Find a Prediction** - Browse available USDC markets
3. **Choose YES or NO** - Based on your prediction
4. **Enter Amount** - Minimum $1 USDC
5. **Approve USDC** - First time only, approve the contract to use your USDC
6. **Confirm Bet** - Sign the transaction
7. **Wait for Resolution** - Or exit early if you want!

---

## FAQ - USDC Markets

**Q: Can I bet with both USDC and ETH on the same prediction?**
A: Yes! The pools are independent. You can have positions in both.

**Q: What happens if a prediction is cancelled?**
A: You get your full stake back (minus any fees already taken).

**Q: Why is my YES/NO price different from when I bet?**
A: Prices change dynamically as more people bet. This is how AMM works.

**Q: Can creators resolve their own predictions?**
A: No, only authorized resolvers can resolve predictions.

**Q: What's the minimum bet?**
A: $1 USDC minimum.

**Q: Is there a maximum bet?**
A: No maximum, but large bets will move the price significantly.

---

## Smart Contract Details

- **Contract:** PredictionMarket_USDC_DualPool
- **Network:** Base (Chain ID: 8453)
- **USDC Decimals:** 6 (1 USDC = 1,000,000 units)
- **Platform Fee:** 1% (max 5%)
- **Creator Fee:** 0.5% (max 2%)
- **Early Exit Fee:** 5% (max 10%)

---

*For more help, visit Help & FAQ or join our Discord/Telegram community!*
