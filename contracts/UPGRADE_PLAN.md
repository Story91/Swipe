# PredictionMarket V2 Upgrade Plan

## Required Changes

### 1. Separate Staking Pools
- Add `swipeYesTotalAmount` and `swipeNoTotalAmount` to Prediction struct
- Add `swipeUserStakes` mapping for $SWIPE stakes

### 2. Multi-Token Staking Functions
- Add `placeStakeWithToken()` for $SWIPE staking
- Add `claimRewardWithToken()` for $SWIPE rewards
- Add `claimRefund()` for cancelled predictions

### 3. Separate Fee Pools
- Add `ethFees` and `swipeFees` variables
- Update fee collection in creation and resolution
- Add `withdrawEthFees()` and `withdrawSwipeFees()` functions

### 4. Approver System
- Add `setApprover()` function (already exists)
- Add `setApprovedCreator()` function (already exists)
- Update `canCreate()` modifier logic

### 5. Emergency Functions
- Update `emergencyWithdraw()` to only withdraw fees
- Add separate emergency functions for staking pools

## Files to Update
- `contracts/PredictionMarket_V2.sol` - Main contract changes
- `lib/contract.ts` - Update ABI and address
- Frontend components - Add token selection UI
