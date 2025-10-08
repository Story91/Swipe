# 🚀 $SWIPE Token - Implementation Guide

## ✅ What Was Implemented

Successfully integrated Flaunch SDK to enable buying and selling of $SWIPE token directly in the application.

---

## 📋 Changes Made

### 1. **Installed Flaunch SDK**
```bash
npm install @flaunch/sdk
```

### 2. **Created SwipeTokenCard Component**
- **Location:** `app/components/Market/SwipeTokenCard.tsx`
- **Features:**
  - ✅ Buy SWIPE with ETH using Flaunch SDK
  - ✅ Sell SWIPE for ETH with Permit2 (gasless approvals)
  - ✅ Quick Buy buttons (0.0001, 0.001, 0.01 ETH)
  - ✅ Custom amount inputs
  - ✅ Slippage tolerance settings (1%, 3%, 5%, 10%)
  - ✅ Real-time SWIPE balance display
  - ✅ Transaction status tracking
  - ✅ OnchainKit MiniKit notifications
  - ✅ Links to Uniswap and DexScreener

### 3. **Added $SWIPE Menu Item**
- **Location:** `app/page.tsx`
- Added new menu option: **"$SWIPE"**
- Positioned between "Swipe" and "Stats"

### 4. **Updated Routing**
- Added `'swipe-token'` to `DashboardType`
- Integrated `SwipeTokenCard` component in main app routing

---

## 🎯 How to Use

### For Users:

1. **Open the app** and connect your wallet
2. **Click on "$SWIPE"** in the menu
3. **Choose your action:**
   - **Buy Tab:** Purchase SWIPE tokens with ETH
   - **Sell Tab:** Sell SWIPE tokens for ETH

### Buy SWIPE:
- Click one of the Quick Buy buttons (0.0001, 0.001, 0.01 ETH)
- OR enter custom ETH amount and click "Buy"
- Confirm the transaction in your wallet
- Wait for confirmation notification

### Sell SWIPE:
- Switch to "Sell" tab
- Enter SWIPE amount (minimum 10,000)
- Click "Sell"
- Sign the Permit2 message (first time only)
- Confirm the transaction
- Wait for confirmation notification

---

## 🔧 Technical Details

### Token Information:
```typescript
SWIPE_TOKEN = {
  address: '0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9',
  symbol: 'SWIPE',
  decimals: 18,
  name: 'Swipe'
}
```

### Network:
- **Base Mainnet** (Chain ID: 8453)

### Flaunch SDK Integration:
```typescript
const flaunchSDK = createFlaunch({
  publicClient,  // from wagmi
  walletClient,  // from wagmi
});
```

### Buy Function:
```typescript
await flaunchSDK.buyCoin({
  coinAddress: SWIPE_TOKEN.address,
  slippagePercent: 5,
  swapType: "EXACT_IN",
  amountIn: parseEther("0.001")
});
```

### Sell Function (with Permit2):
```typescript
// Check allowance
const { allowance } = await flaunchSDK.getPermit2AllowanceAndNonce(
  SWIPE_TOKEN.address
);

// If needed, get permit signature
const { typedData, permitSingle } = await flaunchSDK.getPermit2TypedData(
  SWIPE_TOKEN.address
);

// Sell with permit
await flaunchSDK.sellCoin({
  coinAddress: SWIPE_TOKEN.address,
  amountIn,
  slippagePercent,
  permitSingle,
  signature
});
```

---

## 🎨 UI Features

### Design Theme:
- **Background:** Black with yellow-green (#d4ff00) accents
- **Logo:** SWIPE logo in circular avatar frame with yellow-green border
- **Colors:** Black, light green, yellow (#d4ff00) matching app theme

### Tabs:
- **Buy Tab** (Yellow-Green) - Purchase SWIPE with ETH
- **Sell Tab** (Yellow-Green) - Sell SWIPE for ETH

### Quick Buy Buttons:
- 🟡 **0.0001 ETH** - Yellow-green gradient
- 🟡 **0.001 ETH** - Yellow-green to green gradient  
- 🟡 **0.01 ETH** - Yellow-green to lime gradient

### Slippage Tolerance:
- Adjustable: 1%, 3%, 5%, 10%
- Default: 5%

### Balance Display:
- Shows current SWIPE token balance
- Updates automatically after transactions

### Transaction Tracking:
- Shows transaction hash
- Link to BaseScan explorer
- Auto-hides after 5 seconds

---

## 🔗 External Links

The component includes links to:

1. **Uniswap** - Swap ETH → SWIPE on Uniswap
   - Opens Uniswap with pre-filled SWIPE token address

2. **DexScreener** - View SWIPE price and charts
   - Opens DexScreener for SWIPE token analytics

---

## 📱 Notifications

Uses OnchainKit MiniKit for notifications:

- ✅ **Purchase Successful** - After successful buy
- ❌ **Purchase Failed** - If buy transaction fails
- ✅ **Sale Successful** - After successful sell
- ❌ **Sale Failed** - If sell transaction fails
- 🔐 **Signature Required** - When Permit2 signature needed
- ⚠️ **Error** - Wallet not connected or SDK not ready

---

## 🎨 Updated Design Features

### Visual Theme:
- **Main Background:** Black (#000000)
- **Accent Color:** Bright yellow-green (#d4ff00)
- **Logo Display:** SWIPE logo in circular frame with yellow-green border
- **Text Colors:** White for primary text, yellow-green for accents
- **Input Fields:** Dark gray (gray-800) with yellow-green focus states

### Color Palette:
- **Primary:** Yellow-green (#d4ff00) - buttons, borders, highlights
- **Secondary:** Dark grays (gray-800/900) - backgrounds, inputs
- **Text:** White - primary text, yellow-green - accent text
- **Borders:** Yellow-green for active states, gray for inactive

## 🚦 Error Handling

The component handles:
- Wallet not connected
- SDK not initialized
- Transaction failures
- Permit2 signature rejections
- Insufficient balances
- Slippage errors

---

## 🔄 How Flaunch SDK Works

### Automatic Features:
1. **Best Price Discovery** - Finds best liquidity pool automatically
2. **Price Calculation** - Calculates exact token amounts
3. **Gas Estimation** - Estimates transaction costs
4. **Slippage Protection** - Protects against price slippage
5. **Transaction Management** - Handles transaction lifecycle
6. **Permit2 Support** - Gasless approvals for selling

### Your Responsibilities:
1. Initialize SDK with `publicClient` and `walletClient`
2. Call `buyCoin()` or `sellCoin()` with parameters
3. Wait for transaction receipt
4. Update UI and refresh balances

---

## 📊 Integration with Existing Features

The $SWIPE token is already integrated with:

- **Prediction Staking** - Users can stake SWIPE on predictions (via `TinderCard.tsx`)
- **V2 Contract** - Full support for SWIPE staking in V2 contract
- **Minimum Stake** - 10,000 SWIPE minimum for predictions
- **No Maximum** - Unlimited SWIPE stakes allowed

Now users can:
1. Buy SWIPE tokens via Flaunch SDK
2. Use SWIPE to bet on predictions
3. Sell SWIPE back to ETH when needed

---

## 🎉 Summary

**You now have a complete token swap interface in your app!**

Users can:
- ✅ Buy SWIPE with ETH (Quick Buy or custom amounts)
- ✅ Sell SWIPE for ETH (with Permit2 gasless approvals)
- ✅ Adjust slippage tolerance
- ✅ View real-time SWIPE balance
- ✅ Access alternative DEX links
- ✅ Track transactions on BaseScan
- ✅ Receive notifications for all actions

**All powered by Flaunch SDK - the easiest way to swap tokens on Base! 🚀**

---

## 🚀 SWIPERS Community

### Join SWIPERS Group on Flaunch
- **Group Link:** [https://flaunch.gg/base/group/0x7d96076c750e65b60561491278280e3c324e1944](https://flaunch.gg/base/group/0x7d96076c750e65b60561491278280e3c324e1944)
- **Token Link:** [https://flaunch.gg/base/coin/0xd0187d77af0ed6a44f0a631b406c78b30e160aa9](https://flaunch.gg/base/coin/0xd0187d77af0ed6a44f0a631b406c78b30e160aa9)

### Earn ETH from Trading Fees 💰
- 🤝 **Members receive pro-rata ETH rewards**
- 🧠 **Coin creators & holders win together**
- 📈 **Stake your SWIPE tokens and earn passive income**

### Fee Split Structure:
- 👑 **Owner** – 20%
- ⚡️ **Creators** – 30%  
- 💎 **Members** – 50%

**Access:** OPEN to all SWIPE holders!

## 📞 Links

- **SWIPE Token on BaseScan:** https://basescan.org/token/0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9
- **Uniswap Swap:** https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency=0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9&chain=base
- **DexScreener:** https://dexscreener.com/base/0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9
- **Flaunch Platform:** https://flaunch.gg

---

**Created for Dexter App | Base Blockchain | Flaunch SDK Integration**

