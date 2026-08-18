'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { isWritableMarket } from '@/lib/chains';
import { useActiveChain } from '@/lib/chains/activeChain';
import { useMarketWrite } from '@/lib/chains/useMarketWrite';
import { txUrl } from '@/lib/chains/market';
import { describeWriteError, formatCollateral } from './onChainClaims';
import './CreatorRewards.css';

/**
 * What a market creator is owed, and the button that pays it.
 *
 * PredictionMarket_V4 credits the creator fee to `creatorRewards[creator]` when
 * a market resolves and leaves it there. That is deliberate, and the contract
 * says why: pushing the payment during resolution let a creator who cannot
 * receive the token block settlement for everyone else in that market. The
 * consequence is that the money only moves when the creator asks, and until now
 * nothing in the app asked. `claimCreatorReward` had no caller in any component,
 * hook, script or route, and the FAQ told creators to call the contract
 * themselves.
 *
 * The whole panel hides itself when the balance is zero, which is almost
 * everybody. A creator who has already collected sees it disappear on the next
 * read, which is the right answer: there is nothing there.
 *
 * `claimCreatorReward()` takes no arguments and reverts on exactly one thing,
 * `require(amount > 0, "Nothing to claim")`, so the balance being non-zero is
 * the entire precondition. Every other guard here is about which contract the
 * call goes to, not about whether it would succeed.
 */
export function CreatorRewards() {
  const { address } = useAccount();
  const { chainKey } = useActiveChain();
  const marketWrite = useMarketWrite();
  const market = marketWrite.market;

  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [sending, setSending] = useState(false);
  /** Held after a claim confirms, so the panel can show a receipt as it empties. */
  const [collected, setCollected] = useState<{ amount: string; hash: string } | null>(null);

  const { data: owedRaw, refetch } = useReadContract({
    address: market?.address,
    abi: market?.abi,
    functionName: 'creatorRewards',
    args: address ? [address] : undefined,
    chainId: market?.chainId,
    query: {
      enabled: Boolean(address && market),
      // Slower than the position reads elsewhere. This only moves when one of
      // your markets resolves, which is not something that happens while you
      // watch the screen.
      refetchInterval: 60_000,
    },
  });

  // The live rate, not the deploy-day one. The owner can move creatorFee, and a
  // creator reading a hardcoded 0.5% while the contract pays something else is
  // being told a number about their own money that is not true.
  const { data: feeConfig } = useReadContract({
    address: market?.address,
    abi: market?.abi,
    functionName: 'getFeeConfig',
    chainId: market?.chainId,
    query: { enabled: Boolean(market) },
  });

  const owed = typeof owedRaw === 'bigint' ? owedRaw : BigInt(0);
  const decimals = market?.collateral.decimals ?? 6;
  const symbol = market?.collateral.symbol ?? '';
  const creatorBps = feeConfig ? (feeConfig as readonly bigint[])[1] : null;

  const receipt = useWaitForTransactionReceipt({ hash, chainId: market?.chainId });

  useEffect(() => {
    if (!hash) return;
    if (receipt.isError) {
      setError('The transaction failed on chain. Nothing was moved.');
      setHash(undefined);
      setSending(false);
      return;
    }
    if (!receipt.isSuccess) return;
    setCollected({ amount: formatCollateral(owed, decimals), hash });
    setHash(undefined);
    setSending(false);
    refetch();
    // `owed` is read at the moment the receipt lands, which is still the
    // pre-claim balance because the refetch has not returned yet. That is the
    // figure the receipt should name.
  }, [hash, receipt.isError, receipt.isSuccess, owed, decimals, refetch]);

  const claim = useCallback(async () => {
    setError(null);
    setCollected(null);

    // The address this is about to write to, named once and checked against the
    // selected chain's market. useMarketWrite re-checks at send time; this copy
    // keeps the refusal on the panel rather than in the wallet.
    const target = market?.address ?? null;
    if (!marketWrite.ready || !market || !isWritableMarket(chainKey, target)) {
      setError(
        marketWrite.wrongNetwork
          ? 'Your wallet is on a different network. Switch it to collect.'
          : 'This network has no Swipe market, so there is nothing to collect from.'
      );
      return;
    }
    if (owed <= BigInt(0)) {
      setError('Nothing is credited to this address.');
      return;
    }

    try {
      setSending(true);
      setHash(await marketWrite.write({ functionName: 'claimCreatorReward' }));
    } catch (e) {
      setSending(false);
      setError(describeWriteError(e, 'The claim was not sent.'));
    }
  }, [chainKey, market, marketWrite, owed]);

  // Nothing credited and nothing just collected means this address has never
  // created a market that resolved, which is most people. Show them nothing.
  if (!address || !market) return null;
  if (owed <= BigInt(0) && !collected && !sending) return null;

  const amount = formatCollateral(owed, decimals);
  const rate = creatorBps === null ? null : (Number(creatorBps) / 100).toFixed(2);

  return (
    <section className="sheet-block">
      <div className="sheet-rail">
        <p className="sheet-eyebrow">Creator</p>
        <p className="sheet-rail-meta">{`Waits for you,\nnever expires`}</p>
      </div>
      <div>
        <div className="sheet-board">
          <div className="sheet-board-head">
            <h2 className="sheet-board-title">Your cut of the markets you opened</h2>
            <p className="sheet-board-meta">
              {rate === null ? 'reading the rate' : `${rate}% of each losing pool`}
            </p>
          </div>

          <div className="sheet-settle">
            <div className="sheet-settle-row sheet-settle-row--total">
              <span className="sheet-settle-key">Credited and waiting</span>
              <span className="sheet-settle-val">
                {amount} {symbol}
              </span>
            </div>
          </div>

          <p className="cr-note">
            The contract credits this the moment one of your markets resolves and
            then holds it. It is not sent to you, because a creator who cannot
            receive the token would otherwise block settlement for everyone else
            in that market. So it sits here until you take it. Nothing expires.
          </p>

          <div className="cr-actions">
            <button
              type="button"
              className="sheet-action"
              onClick={claim}
              disabled={sending || owed <= BigInt(0)}
            >
              {sending
                ? 'Waiting for the chain'
                : owed <= BigInt(0)
                  ? 'Nothing left to collect'
                  : `Collect ${amount} ${symbol}`}
            </button>
            {marketWrite.wrongNetwork && (
              <span className="cr-hint">
                Your wallet is on another network. Collecting will ask it to move.
              </span>
            )}
          </div>

          {error && (
            <p className="cr-error" role="alert">
              {error}
            </p>
          )}

          {collected && (
            <p className="cr-done">
              {collected.amount} {symbol} sent to your wallet.{' '}
              <a href={txUrl(chainKey, collected.hash)} target="_blank" rel="noreferrer">
                See the transaction
              </a>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
