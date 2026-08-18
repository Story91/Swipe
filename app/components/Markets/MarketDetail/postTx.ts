import type { ChainKey } from '@/lib/chains';
import { txUrl } from '@/lib/chains/market';

/**
 * The bookkeeping a confirmed market transaction owes, off chain.
 *
 * Three POSTs travel with every bet and every exit, wherever the send happens:
 * the transaction history record, the Redis pool sync, and the price-history
 * point that keeps the charts moving. SwipeMarkets carried all three inline
 * until it was retired; this is the same sequence extracted so the detail page
 * and the exit rows do not each grow a private copy that drifts.
 *
 * None of this moves money. Every function here is fetch() against our own
 * API, run after the receipt has confirmed, and a failure is logged rather
 * than surfaced: the chain is already right, only the mirrors lag.
 */

export interface UserTransactionRecord {
  type: 'stake' | 'exit_early';
  /** Canonical Redis id, from parseMarketId. Never rebuilt by hand. */
  redisId: string;
  question: string;
  txHash: string;
  chainKey: ChainKey;
  tokenSymbol: string;
  /** Raw collateral units, 6 decimals. */
  amountUnits: bigint;
  /** Exit only. Raw units. */
  exitFeeUnits?: bigint;
  /** Exit only. Raw units. */
  receivedUnits?: bigint;
}

export async function saveUserTransaction(
  userAddress: string,
  record: UserTransactionRecord
): Promise<void> {
  try {
    const transaction: Record<string, unknown> = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      type: record.type,
      predictionId: record.redisId,
      predictionQuestion: record.question,
      txHash: record.txHash,
      // Field name is historical; the value follows the chain the transaction
      // actually happened on rather than assuming Basescan.
      basescanUrl: txUrl(record.chainKey, record.txHash),
      timestamp: Date.now(),
      status: 'success',
      tokenType: record.tokenSymbol,
      amount: Number(record.amountUnits),
    };
    if (record.exitFeeUnits !== undefined) {
      transaction.exitFee = Number(record.exitFeeUnits);
    }
    if (record.receivedUnits !== undefined) {
      transaction.receivedAmount = Number(record.receivedUnits);
    }
    await fetch('/api/user-transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The chain, or the record lands in Base's list whatever chain it
      // happened on. The key is namespaced now and the route reads this.
      body: JSON.stringify({ userId: userAddress.toLowerCase(), transaction, chain: record.chainKey }),
    });
  } catch (e) {
    console.error('Failed to save transaction record:', e);
  }
}

/**
 * Sync the pools to Redis, then write the price-history point the chart reads.
 *
 * Retries because the RPC the sync route reads can lag the block the receipt
 * came from. The history point is only written when the sync confirmed the
 * market is registered, and it carries the pools the sync just read, so the
 * chart and the listing agree.
 */
export async function syncPoolsAndHistory(params: {
  chainKey: ChainKey;
  redisId: string;
  numericId: number;
  betAmountUnits: bigint;
  betSide: 'yes' | 'no';
  eventType: 'stake' | 'early_exit';
}): Promise<void> {
  const { chainKey, redisId, numericId, betAmountUnits, betSide, eventType } = params;

  // Let the block propagate to whatever RPC the sync route reads.
  await new Promise((resolve) => setTimeout(resolve, 2000));

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const syncResponse = await fetch('/api/sync/usdc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: chainKey, predictionIds: [redisId] }),
      });

      if (syncResponse.ok) {
        const syncData = await syncResponse.json();
        const result = syncData.results?.[numericId];

        if (result?.registered) {
          await fetch(`/api/predictions/${redisId}/price-history?chain=${chainKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              yesPool: (result.yesPool || 0) * 1e6,
              noPool: (result.noPool || 0) * 1e6,
              betAmount: Number(betAmountUnits),
              betSide,
              eventType,
            }),
          });
        }
        return;
      }
    } catch (e) {
      console.error(`Pool sync attempt ${attempt} failed:`, e);
    }
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}
