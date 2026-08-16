# Security audit — PredictionMarket_USDC_DualPool

**Date:** 2026-08-17
**Target:** `contracts/PredictionMarket_USDC_DualPool.sol` (823 lines, solc ^0.8.20)
**Deployed:** Base `0xf5Fa6206c2a7d5473ae7468082c9D260DFF83205`
**Reason:** this contract is the template for the planned USDG deployment on
Robinhood Chain. Every finding below must be resolved before that deployment,
not after.

**Method:** manual read of the source, each finding quoted from the file rather
than inferred. On-chain state confirmed with `scripts/audit_ownership.js`.

> This is an internal review. It is not a substitute for an external audit of a
> contract that will custody other people's money.

---

## Summary

| # | Finding | Severity | Requires |
|---|---|---|---|
| 1 | Resolver can take ~99.5% of any pool by resolving to the empty side | **Critical** | resolver role |
| 2 | `rescueOrphanedUSDC` lets the owner drain all user funds | **Critical** | owner |
| 3 | `resolvePrediction` has no deadline guard | **High** | resolver role |
| 4 | Fee rates read at claim, booked at resolve — cross-market solvency risk | **High** | owner changes fees |
| 5 | `exitEarly` leaves untracked surplus | **Medium** | normal use |
| 6 | No SafeERC20 | **Medium** | non-standard token |
| 7 | No ownership recovery path | **Medium** | key loss |

Findings 1 and 2 are unconditional loss-of-funds paths available to privileged
roles. Finding 7 is not theoretical: the sibling contract `PredictionMarketV2`
lost its owner key, and 33.7M SWIPE is now permanently unclaimable because of it.

---

## 1. Resolver can take ~99.5% of any pool — Critical

`resolvePrediction`:

```solidity
if (winnersPool == 0) {
    // NO WINNERS: Platform takes all losers pool (house wins)
    creatorReward = (losersPool * creatorFee) / BASIS_POINTS;
    platformFeeAmount = losersPool - creatorReward;
}
platformFeeBalance += platformFeeAmount;
```

If the resolver picks the outcome nobody bet on, `winnersPool` is zero and the
entire opposing pool becomes platform fee, withdrawable via
`withdrawPlatformFees`. On a market where every bet is on YES, resolving NO
transfers ~99.5% of all stakes to the platform.

Combined with finding 3 (no deadline guard) the resolver does not even have to
wait for betting to close — they can watch the pools fill and settle at will.

This is the worst finding because it needs only the **resolver** role, which the
automation design was about to hand to a hot key on a server.

**Fix:** when `winnersPool == 0` the market has no winner and stakes must be
refundable, not seized. Treat it as a cancellation: mark the market refundable
and let participants reclaim their principal. A house-takes-all branch has no
legitimate use here and creates a direct incentive to resolve dishonestly.

## 2. `rescueOrphanedUSDC` drains user funds — Critical

```solidity
function rescueOrphanedUSDC(uint256 expectedPoolsTotal) external onlyOwner {
    uint256 actualBalance = usdc.balanceOf(address(this));
    uint256 expectedBalance = expectedPoolsTotal + platformFeeBalance;
    require(actualBalance > expectedBalance, "No orphaned USDC");
    uint256 orphanedAmount = actualBalance - expectedBalance;
    require(usdc.transfer(owner, orphanedAmount), "Rescue transfer failed");
}
```

`expectedPoolsTotal` comes from the caller and is never checked against anything.
Passing `0` makes `orphanedAmount` the whole balance minus booked fees, and
transfers every user's stake to the owner in one transaction.

**Fix:** the contract already has the information it needs. Track the sum of live
pools in storage as bets, exits, refunds and payouts move it, and compute the
orphaned amount on-chain. Never accept it as an argument. If that accounting is
not trusted, the function should not exist.

## 3. `resolvePrediction` has no deadline guard — High

```solidity
function resolvePrediction(uint256 predictionId, bool outcome)
    external onlyResolver predictionExists(predictionId)
```

Betting is gated by `predictionActive`, which requires
`block.timestamp < pred.deadline`. Resolution is gated by nothing. A market can
be settled while bets are still open.

`PredictionMarketV2` gets this right with an `afterDeadline` modifier, so the
omission is inconsistent within the same codebase.

**Fix:** require `block.timestamp >= pred.deadline`.

## 4. Fee rates read at claim, booked at resolve — High

At resolve the platform fee is booked into `platformFeeBalance` and the creator
reward is transferred out, both using the rates in force at that moment. At claim
the payout is recomputed from live storage:

```solidity
uint256 totalFees = ((platformFee + creatorFee) * losersPool) / BASIS_POINTS;
uint256 netLosersPool = losersPool - totalFees;
```

`setPlatformFee`, `setCreatorFee` and `setAllFees` can change those rates between
resolution and the last claim. Lowering them makes claims deduct less, so winners
are paid more than was reserved for that market — the excess comes out of other
markets' pools held in the same contract. That is a cross-market solvency risk,
not just an accounting mismatch.

**Fix:** snapshot the fee rates into the `Prediction` struct at resolution and
have `claimWinnings` read the snapshot.

## 5. `exitEarly` leaves untracked surplus — Medium

```solidity
pred.yesPool -= amount;            // full notional leaves the pool
platformFeeBalance += fee;         // fee is tracked
usdc.transfer(msg.sender, netValue);  // netValue = grossValue - fee
```

`grossValue = amount * price` where `price <= 1`, so `amount - grossValue` stays
in the contract, belongs to no pool, and is not in `platformFeeBalance`. Every
early exit widens the gap.

This is the accounting hole that finding 2 was written to clean up. Fixing it
removes the reason `rescueOrphanedUSDC` exists.

**Fix:** decrement the pool by the value actually removed, or credit the
difference to an explicit on-chain surplus balance.

## 6. No SafeERC20 — Medium

All transfers are raw `require(usdc.transfer(...), "...")`. Tokens that return no
value on transfer make the ABI decode revert; tokens that return `false` instead
of reverting are handled, but only because of the `require`.

This matters concretely for the planned USDG deployment: USDG is a different
token from USDC and its transfer semantics must be verified, not assumed. The
audit script confirmed `symbol() == "USDG"` and `decimals() == 6`, so the decimal
math ports unchanged, but return-value behaviour was not verified.

**Fix:** use OpenZeppelin `SafeERC20`. `@openzeppelin/contracts` is already a
dependency.

## 7. No ownership recovery path — Medium

`transferOwnership` / `acceptOwnership` exist here, which is better than
`PredictionMarketV2`, but there is still no path that survives losing the owner
key: markets can then never be resolved and stakes are stranded.

This already happened. The owner of all four deployed contracts,
`0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd`, is compromised and its key is
unrecoverable, which is what makes 33.7M SWIPE in V2 permanently unclaimable.

**Fix:** add a fallback that lets participants reclaim their principal once a
market is past its deadline by a wide margin and still unresolved — no privileged
call required. Stakes should never depend on a single key remaining available.

---

## What the USDG contract must have

Carried over from findings above, plus the resolver role the phased plan wanted:

1. No house-takes-all branch. `winnersPool == 0` means refundable.
2. Pool total tracked on-chain; no caller-supplied balances.
3. `resolvePrediction` requires the deadline to have passed.
4. Fee rates snapshotted at resolution.
5. `exitEarly` accounting closed.
6. SafeERC20 throughout.
7. Two-step ownership **and** a permissionless refund path after a grace period.
8. A `resolvers` mapping separate from `owner`, so automation runs on a narrow,
   revocable hot key while ownership stays cold. This is the "phase B" the
   original plan deferred; since every contract is being redeployed anyway, it
   costs nothing to include now.
