# SwipeTokenCard Component

## Overview

A complete token swap interface for buying and selling $SWIPE tokens using Flaunch SDK on Base network.

## Features

- 🔄 **Buy SWIPE** - Purchase SWIPE tokens with ETH
- 💰 **Sell SWIPE** - Sell SWIPE tokens for ETH
- ⚡ **Quick Buy Buttons** - Pre-set amounts (0.0001, 0.001, 0.01 ETH)
- 🎚️ **Slippage Control** - Adjustable slippage tolerance (1-10%)
- 📊 **Balance Display** - Real-time SWIPE token balance
- 🔐 **Permit2 Support** - Gasless approvals for token sales
- 📱 **Notifications** - OnchainKit MiniKit notifications
- 🔗 **DEX Links** - Links to Uniswap and DexScreener

## Usage

### Import

```typescript
import { SwipeTokenCard } from "./components/Market/SwipeTokenCard";
```

### Basic Usage

```tsx
<SwipeTokenCard />
```

That's it! The component is fully self-contained.

## Requirements

### Dependencies

- `@flaunch/sdk` - For DEX swap functionality
- `@coinbase/onchainkit` - For wallet and notifications
- `wagmi` - For wallet connection and blockchain interactions
- `viem` - For Ethereum utilities

### Context Requirements

The component must be used within:
1. `WagmiConfig` provider
2. `OnchainKitProvider` provider

These are already configured in the app's `providers.tsx`.

## Component Props

This component has **no props** - it's completely standalone!

## State Management

### Internal State

- `isLoading` - Transaction loading state
- `transactionHash` - Current transaction hash
- `buyAmount` - Custom buy amount (ETH)
- `sellAmount` - Custom sell amount (SWIPE)
- `slippagePercent` - Slippage tolerance (1-10%)
- `activeTab` - Current tab ("buy" | "sell")
- `signature` - Permit2 signature data

### Wagmi Hooks Used

```typescript
useAccount()           // Get connected wallet address
usePublicClient()      // Get public client for blockchain reads
useWalletClient()      // Get wallet client for transactions
useReadContract()      // Read SWIPE token balance
useSignTypedData()     // Sign Permit2 messages
```

## Functions

### buyWithETH(ethAmount: string)

Purchases SWIPE tokens with ETH using Flaunch SDK.

**Parameters:**
- `ethAmount` - Amount of ETH to spend (as string)

**Example:**
```typescript
await buyWithETH("0.001");
```

**Process:**
1. Validates SDK and wallet connection
2. Calls `flaunchSDK.buyCoin()` with parameters
3. Waits for transaction confirmation
4. Shows success/error notification
5. Refreshes SWIPE balance

### sellSWIPETokens()

Sells SWIPE tokens for ETH using Flaunch SDK with Permit2.

**Process:**
1. Checks Permit2 allowance
2. If needed, requests signature for permit
3. Calls `flaunchSDK.sellCoin()` with permit data
4. Waits for transaction confirmation
5. Shows success/error notification
6. Refreshes SWIPE balance

## UI Structure

```
SwipeTokenCard
├── Header
│   ├── Title ($SWIPE Token)
│   └── Subtitle
├── Balance Display
│   ├── Current SWIPE balance
│   └── Token address
├── Tabs
│   ├── Buy Tab
│   └── Sell Tab
├── Buy Tab Content
│   ├── Quick Buy Buttons (3 preset amounts)
│   └── Custom Amount Input
├── Sell Tab Content
│   └── SWIPE Amount Input
├── Slippage Settings
│   └── Buttons (1%, 3%, 5%, 10%)
├── Transaction Hash Display
│   └── Link to BaseScan
├── DEX Links
│   ├── Uniswap Link
│   └── DexScreener Link
└── Wallet Connection Notice
```

## Styling

Uses Tailwind CSS with:
- **Dark theme** with yellow-green (#d4ff00) accents
- **SWIPE logo** in circular avatar frame
- Gradient backgrounds for action buttons
- Responsive design (mobile-first)
- Hover states and transitions
- Disabled states
- Loading spinners
- **App theme consistency** - black, light green, yellow

### Color Scheme (Updated)

- **Yellow-Green Gradient** - Buy 0.0001 ETH (#d4ff00 to yellow-300)
- **Yellow-Green to Green** - Buy 0.001 ETH (#d4ff00 to green-400)  
- **Yellow-Green to Lime** - Buy 0.01 ETH (#d4ff00 to lime-400)
- **Yellow-Green** - Sell button (#d4ff00)
- **Black Background** - Main container
- **Dark Gray** - Input fields and secondary elements

## Notifications

The component sends notifications for:

| Event | Title | Type |
|-------|-------|------|
| Buy Success | 🎉 Purchase Successful! | Success |
| Buy Failed | ❌ Purchase Failed | Error |
| Sell Success | 🎉 Sale Successful! | Success |
| Sell Failed | ❌ Sale Failed | Error |
| Signature Needed | 🔐 Signature Required | Info |
| Wallet Error | Error | Error |

## Transaction Flow

### Buy Flow

```
User clicks "Buy" button
    ↓
buyWithETH() called
    ↓
flaunchSDK.buyCoin({
  coinAddress: SWIPE_TOKEN.address,
  slippagePercent: 5,
  swapType: "EXACT_IN",
  amountIn: parseEther("0.001")
})
    ↓
Wallet popup - user confirms
    ↓
Transaction submitted
    ↓
Wait for confirmation
    ↓
Success notification
    ↓
Refresh SWIPE balance
```

### Sell Flow (with Permit2)

```
User enters amount and clicks "Sell"
    ↓
sellSWIPETokens() called
    ↓
Check Permit2 allowance
    ↓
If insufficient allowance:
  - Get Permit2 typed data
  - Request signature (gasless!)
  - User signs message
    ↓
flaunchSDK.sellCoin({
  coinAddress: SWIPE_TOKEN.address,
  amountIn,
  slippagePercent,
  permitSingle,
  signature
})
    ↓
Transaction submitted
    ↓
Wait for confirmation
    ↓
Success notification
    ↓
Refresh SWIPE balance
```

## Error Handling

The component handles:

- ❌ Wallet not connected
- ❌ SDK not initialized
- ❌ Transaction failures
- ❌ User rejection
- ❌ Insufficient balance
- ❌ Slippage exceeded
- ❌ Permit2 signature rejection

All errors show user-friendly notifications.

## Performance Considerations

- SDK initialized only when both clients are available (useMemo)
- Balance refetch triggered only after successful transactions
- Transaction hash auto-cleared after 5 seconds
- Optimistic UI updates

## Security

- ✅ Uses Permit2 for gasless approvals (no direct ERC20 approve)
- ✅ Slippage protection
- ✅ Transaction validation before submission
- ✅ User confirmation required for all transactions
- ✅ Signature verification through wagmi

## Integration Examples

### In a Dashboard

```tsx
import { SwipeTokenCard } from "./components/Market/SwipeTokenCard";

function Dashboard() {
  return (
    <div className="dashboard">
      <h1>Token Management</h1>
      <SwipeTokenCard />
    </div>
  );
}
```

### In a Modal

```tsx
import { SwipeTokenCard } from "./components/Market/SwipeTokenCard";

function TokenModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal">
      <button onClick={onClose}>Close</button>
      <SwipeTokenCard />
    </div>
  );
}
```

### Standalone Page

```tsx
// app/swap/page.tsx
import { SwipeTokenCard } from "../components/Market/SwipeTokenCard";

export default function SwapPage() {
  return (
    <div className="container mx-auto py-8">
      <SwipeTokenCard />
    </div>
  );
}
```

## Customization

To customize the component:

1. **Change Token** - Update `SWIPE_TOKEN` import from `lib/contract.ts`
2. **Adjust Amounts** - Modify Quick Buy button values
3. **Change Slippage Options** - Edit slippage percentage array
4. **Styling** - Modify Tailwind classes
5. **Notifications** - Customize notification messages

## Token Configuration

Current configuration from `lib/contract.ts`:

```typescript
export const SWIPE_TOKEN = {
  address: '0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9',
  symbol: 'SWIPE',
  decimals: 18,
  name: 'Swipe'
};
```

## External Links

The component provides links to:

1. **Uniswap** - Swap interface
   ```
   https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency={TOKEN}&chain=base
   ```

2. **DexScreener** - Token analytics
   ```
   https://dexscreener.com/base/{TOKEN}
   ```

3. **BaseScan** - Transaction explorer
   ```
   https://basescan.org/tx/{HASH}
   ```

## Future Enhancements

Potential improvements:

- [ ] Support for multiple tokens
- [ ] Price impact warnings
- [ ] Historical transaction list
- [ ] Swap reversal (undo)
- [ ] Gas price estimation
- [ ] Multi-hop swaps
- [ ] Limit orders
- [ ] Price charts

## Testing

To test the component:

1. Connect wallet on Base network
2. Try buying with different amounts
3. Check balance updates
4. Try selling SWIPE
5. Test Permit2 signature flow
6. Verify notifications appear
7. Check external links work

## Troubleshooting

### "SDK not ready"
- Ensure wallet is connected
- Verify on Base network
- Check console for errors

### "Transaction failed"
- Check sufficient ETH for gas
- Verify slippage tolerance
- Check token balance for sells

### "Signature required"
- Normal for first sell
- User must sign Permit2 message
- Not a blockchain transaction

## Support

For issues or questions:
- Check Flaunch documentation: https://docs.flaunch.gg
- Review OnchainKit docs: https://onchainkit.xyz
- Check Base network status: https://status.base.org

---

**Component Version:** 1.0.0  
**Last Updated:** October 8, 2025  
**Network:** Base Mainnet  
**Token:** SWIPE (0xd0187D77Af0ED6a44F0A631B406c78b30E160aA9)

