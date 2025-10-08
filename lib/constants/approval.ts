/**
 * Token Approval Configuration
 * 
 * This file contains configuration for ERC-20 token approvals with slippage protection.
 * 
 * Why slippage buffer?
 * When approving tokens for swaps or staking, price fluctuations can cause the required
 * amount to exceed the approved amount, causing transactions to fail. Adding a buffer
 * ensures approvals cover potential slippage.
 * 
 * Based on Coinbase Developer Documentation:
 * - Standard slippage: 1-5% (100-500 basis points)
 * - Conservative slippage: 10% (1000 basis points)
 * - Basis points: 1 bp = 0.01%, 100 bp = 1%, 1000 bp = 10%
 */

/**
 * Default slippage buffer for token approvals in basis points
 * 
 * 1000 bps = 10% buffer
 * 
 * This buffer is added to all SWIPE token approvals to ensure:
 * - Approvals cover potential price slippage
 * - Large stakes (>10k-30k SWIPE) can be processed
 * - Users don't need multiple approval transactions
 * 
 * @example
 * If user stakes 10,000 SWIPE:
 * - Approval amount = 10,000 * (10000 + 1000) / 10000 = 11,000 SWIPE
 * - This allows up to 10% price movement without requiring re-approval
 */
export const SLIPPAGE_BUFFER_BPS = 1000; // 10%

/**
 * Calculate approval amount with slippage buffer
 * 
 * @param amount - Base amount to approve (in wei/smallest unit)
 * @param bufferBps - Slippage buffer in basis points (default: SLIPPAGE_BUFFER_BPS)
 * @returns Approval amount with buffer applied
 * 
 * @example
 * const stakeAmount = parseEther("10000"); // 10,000 SWIPE
 * const approvalAmount = calculateApprovalAmount(stakeAmount);
 * // Returns: 11,000 SWIPE (with 10% buffer)
 */
export function calculateApprovalAmount(
  amount: bigint,
  bufferBps: number = SLIPPAGE_BUFFER_BPS
): bigint {
  return (amount * BigInt(10000 + bufferBps)) / BigInt(10000);
}

/**
 * Alternative approval strategies
 */
export const APPROVAL_STRATEGIES = {
  /**
   * Per-transaction approval with slippage buffer
   * ✅ Most secure - limited approval per transaction
   * ✅ Handles slippage automatically
   * ⚠️ Requires approval for each transaction
   */
  WITH_BUFFER: SLIPPAGE_BUFFER_BPS,

  /**
   * Unlimited approval (type(uint256).max)
   * ✅ One-time approval
   * ✅ Best UX - no repeated approvals
   * ⚠️ Requires trust in smart contract
   * 
   * Note: Only use for trusted contracts like your own PredictionMarket_V2
   */
  UNLIMITED: BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),

  /**
   * Conservative buffer for very large amounts or volatile tokens
   * 20% buffer = 2000 basis points
   */
  CONSERVATIVE: 2000,

  /**
   * Minimal buffer for small amounts or stable situations
   * 5% buffer = 500 basis points
   */
  MINIMAL: 500,
} as const;

/**
 * Get recommended buffer based on stake amount
 * 
 * @param amount - Stake amount in SWIPE (human readable)
 * @returns Recommended buffer in basis points
 */
export function getRecommendedBuffer(amount: number): number {
  if (amount >= 100000) return APPROVAL_STRATEGIES.CONSERVATIVE; // 20% for very large stakes
  if (amount >= 50000) return SLIPPAGE_BUFFER_BPS; // 10% for large stakes
  return APPROVAL_STRATEGIES.MINIMAL; // 5% for smaller stakes
}

