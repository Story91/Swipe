'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContracts, useWaitForTransactionReceipt } from 'wagmi';
import { isWritableMarket } from '@/lib/chains';
import { useActiveChain } from '@/lib/chains/activeChain';
import { useMarketWrite } from '@/lib/chains/useMarketWrite';
import { txUrl } from '@/lib/chains/market';
import { CURRENT_GENERATION, parseMarketId } from '@/lib/marketId';
import { refundState, timeUntilRefundsOpen, type RefundView } from '@/lib/refundState';
import { isArchivedLeg } from './portfolioTokens';
import type { PortfolioRow } from './usePortfolio';
import { describeWriteError, formatCollateral } from './onChainClaims';
import './Refunds.css';

/**
 * The way out of a market nobody settled.
 *
 * PredictionMarket_V4 makes a promise the app never kept. Thirty days past a
 * market's deadline, if it has not been resolved or cancelled,
 * `enableRefundsAfterGrace` flips it to refundable, and it is callable by
 * anyone precisely so that backers do not have to wait for a resolver who may
 * never come back. After that every backer takes their raw unweighted stake
 * back with `claimRefund`. Neither call had a caller anywhere in the app. The
 * dashboard's claim button does reach claimRefund, but only for a market Redis
 * has already flagged, and nothing could set that flag on an abandoned market
 * because nothing called the function that sets it.
 *
 * So both halves live here: the permissionless call that opens refunds, and the
 * per-user claim afterwards.
 *
 * WHICH MARKETS GET READ
 *
 * /api/portfolio marks a position 'pending' when its market is neither resolved
 * with a winner nor still inside its deadline, which is exactly the abandoned
 * and cancelled set. Filtering on that keeps the on-chain read to a handful of
 * markets instead of a user's whole book, which matters because Robinhood chain
 * has no multicall3 and each market costs two calls there.
 *
 * Redis is only used to choose which markets to ask about. Every decision below
 * comes from `getPrediction` and `positions` on the contract, because Redis is
 * a mirror and a stale mirror here would either hide somebody's refund or offer
 * a button that reverts.
 */

/** Two contract calls each, and no multicall3 on Robinhood. Bounded on purpose. */
const MAX_MARKETS_READ = 30;

interface Candidate {
  redisId: string;
  numericId: number;
  question: string;
}

interface Row extends Candidate {
  view: RefundView;
}

type ReadEntry =
  | { status: 'success'; result: unknown }
  | { status: 'failure'; error: unknown };

function tupleAt(entry: ReadEntry | undefined): readonly unknown[] | null {
  if (!entry || entry.status !== 'success') return null;
  return Array.isArray(entry.result) ? (entry.result as readonly unknown[]) : null;
}

export function Refunds({
  rows,
  onChanged,
}: {
  rows: PortfolioRow[];
  /** Called after a refund confirms, so the book above can re-read itself. */
  onChanged?: () => void;
}) {
  const { address } = useAccount();
  const { chainKey } = useActiveChain();
  const marketWrite = useMarketWrite();
  const market = marketWrite.market;

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ numericId: number; action: 'open' | 'claim' } | null>(
    null
  );
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [done, setDone] = useState<{ action: 'open' | 'claim'; hash: string } | null>(null);

  // The clock ticks, because a grace period ends while the page is open and a
  // countdown frozen at "in 1 day" is worse than no countdown.
  const [nowSec, setNowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const timer = setInterval(() => setNowSec(BigInt(Math.floor(Date.now() / 1000))), 60_000);
    return () => clearInterval(timer);
  }, []);

  const candidates = useMemo<Candidate[]>(() => {
    const seen = new Set<number>();
    const out: Candidate[] = [];
    for (const row of rows) {
      // ETH and $SWIPE sit on the archived contracts, which have no refund path
      // and no owner to open one.
      if (isArchivedLeg(row.token)) continue;
      if (row.status !== 'pending') continue;
      const ref = parseMarketId(row.id);
      if (!ref || ref.generation !== CURRENT_GENERATION) continue;
      // A market backed on both sides is two rows and one contract position.
      if (seen.has(ref.numericId)) continue;
      seen.add(ref.numericId);
      out.push({ redisId: ref.redisId, numericId: ref.numericId, question: row.question });
    }
    return out.slice(0, MAX_MARKETS_READ);
  }, [rows]);

  const contracts = useMemo(() => {
    if (!market || !address || candidates.length === 0) return [];
    return candidates.flatMap((candidate) => [
      {
        address: market.address,
        abi: market.abi,
        functionName: 'getPrediction',
        args: [BigInt(candidate.numericId)],
        chainId: market.chainId,
      },
      {
        address: market.address,
        abi: market.abi,
        functionName: 'positions',
        args: [BigInt(candidate.numericId), address],
        chainId: market.chainId,
      },
    ]);
  }, [candidates, market, address]);

  // No refetchInterval. This is up to 60 calls on a chain without multicall3,
  // and none of it changes on its own except the clock, which is handled above.
  // It re-reads when a transaction confirms and when the book below reloads.
  // The result is cast rather than the argument. Casting `contracts` to never
  // collapses the hook's own generic, and `refetch` comes back as never with
  // it, so the retry button stops being callable. wagmi cannot infer a return
  // shape from an array built at runtime either way; this puts the cast where
  // it costs only the result typing.
  const { data, refetch, isLoading } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  }) as {
    data: ReadEntry[] | undefined;
    refetch: () => void;
    isLoading: boolean;
  };

  const decoded = useMemo<Row[]>(() => {
    const entries = data ?? [];
    const out: Row[] = [];
    candidates.forEach((candidate, index) => {
      const prediction = tupleAt(entries[index * 2]);
      const position = tupleAt(entries[index * 2 + 1]);
      if (!prediction || prediction.length < 10) return;
      if (!position || position.length < 5) return;

      // getPrediction: registered, creator, deadline, yesPool, noPool, resolved,
      // cancelled, outcome, refundable, participantCount.
      const view = refundState({
        registered: Boolean(prediction[0]),
        deadline: prediction[2] as bigint,
        resolved: Boolean(prediction[5]),
        cancelled: Boolean(prediction[6]),
        refundable: Boolean(prediction[8]),
        now: nowSec,
        // positions: yesAmount, noAmount, weightedYes, weightedNo, claimed.
        yesAmount: position[0] as bigint,
        noAmount: position[1] as bigint,
        claimed: Boolean(position[4]),
      });
      out.push({ ...candidate, view });
    });
    return out;
  }, [candidates, data, nowSec]);

  // Only the three states a person can do something about, or wait out. A
  // settled, emptied or already-taken position belongs in the book above, not
  // in a panel about money that is stuck.
  const shown = useMemo(
    () =>
      decoded
        .filter((row) => ['openable', 'claimable', 'waiting'].includes(row.view.stage))
        .sort((a, b) => Number(a.view.opensAt - b.view.opensAt)),
    [decoded]
  );

  const receipt = useWaitForTransactionReceipt({ hash, chainId: market?.chainId });

  useEffect(() => {
    if (!hash) return;
    if (receipt.isError) {
      setError('The transaction failed on chain. Nothing was moved.');
      setHash(undefined);
      setPending(null);
      return;
    }
    if (!receipt.isSuccess) return;
    setDone({ action: pending?.action ?? 'claim', hash });
    setHash(undefined);
    setPending(null);
    refetch();
    onChanged?.();
  }, [hash, receipt.isError, receipt.isSuccess, pending, refetch, onChanged]);

  const send = useCallback(
    async (numericId: number, action: 'open' | 'claim') => {
      setError(null);
      setDone(null);

      // Same two-part guard the bet and the exit use. The chain half alone is
      // not enough: a caller that checks the chain and then writes to an address
      // of its own has verified nothing about where the transaction goes.
      const target = market?.address ?? null;
      if (!marketWrite.ready || !market || !isWritableMarket(chainKey, target)) {
        setError(
          marketWrite.wrongNetwork
            ? 'Your wallet is on a different network. Switch it to continue.'
            : 'This network has no Swipe market, so there is nothing to refund from.'
        );
        return;
      }

      try {
        setPending({ numericId, action });
        setHash(
          await marketWrite.write({
            functionName: action === 'open' ? 'enableRefundsAfterGrace' : 'claimRefund',
            args: [BigInt(numericId)],
          })
        );
      } catch (e) {
        setPending(null);
        setError(
          describeWriteError(
            e,
            action === 'open' ? 'Refunds were not opened.' : 'The refund was not sent.'
          )
        );
      }
    },
    [chainKey, market, marketWrite]
  );

  // Every read came back a failure. That is not the same fact as "nothing is
  // stuck", and rendering nothing would report an RPC outage as good news to
  // somebody whose stake is sitting in a market nobody settled.
  const readFailed =
    !isLoading && candidates.length > 0 && data !== undefined && decoded.length === 0;

  if (!address || !market) return null;
  if (candidates.length === 0) return null;
  if (isLoading && decoded.length === 0) return null;
  if (shown.length === 0 && !done && !readFailed) return null;

  const decimals = market.collateral.decimals;
  const symbol = market.collateral.symbol;

  return (
    <section className="sheet-block">
      <div className="sheet-rail">
        <p className="sheet-eyebrow">Stuck</p>
        <p className="sheet-rail-meta">{`30 days past\nthe deadline`}</p>
      </div>
      <div>
        <div className="sheet-board">
          <div className="sheet-board-head">
            <h2 className="sheet-board-title">Markets nobody settled</h2>
            <p className="sheet-board-meta">
              {readFailed
                ? 'could not be read'
                : `${shown.length} ${shown.length === 1 ? 'position' : 'positions'}`}
            </p>
          </div>

          <p className="rf-note">
            A market that goes thirty days past its deadline without being
            resolved can be opened for refunds by anyone, including you, and then
            every backer takes their stake back. Raw stake, not weighted, so the
            early bet multiplier does not apply. The clock is the contract's, not
            ours, and it starts at the deadline.
          </p>

          {readFailed && (
            <p className="rf-error" role="status">
              {candidates.length} of your positions could not be read from the
              contract just now, so this list is incomplete. Nothing is lost, the
              read failed.{' '}
              <button type="button" className="rf-retry" onClick={() => refetch()}>
                Read again
              </button>
            </p>
          )}

          <div className="rf-list">
            {shown.map((row) => {
              const busy = pending?.numericId === row.numericId;
              return (
                <div key={row.redisId} className="rf-row">
                  <div className="rf-main">
                    <div className="rf-question">{row.question}</div>
                    <div className="rf-sub">
                      <span className="rf-id">{row.redisId}</span>
                      {row.view.stage === 'waiting' && (
                        <span className="rf-state">
                          refunds open {timeUntilRefundsOpen(row.view.opensAt, nowSec)}
                        </span>
                      )}
                      {row.view.stage === 'openable' && (
                        <span className="rf-state rf-state--live">grace period is over</span>
                      )}
                      {row.view.stage === 'claimable' && (
                        <span className="rf-state rf-state--live">refunds are open</span>
                      )}
                    </div>
                  </div>

                  <div className="rf-figure">
                    <span className="rf-figure-label">Your stake</span>
                    <span className="rf-figure-val">
                      {formatCollateral(row.view.amount, decimals)} {symbol}
                    </span>
                  </div>

                  <div className="rf-action">
                    {row.view.stage === 'claimable' && (
                      <button
                        type="button"
                        className="sheet-action"
                        onClick={() => send(row.numericId, 'claim')}
                        disabled={busy}
                      >
                        {busy ? 'Waiting' : 'Take it back'}
                      </button>
                    )}
                    {row.view.stage === 'openable' && (
                      <button
                        type="button"
                        className="sheet-action"
                        onClick={() => send(row.numericId, 'open')}
                        disabled={busy}
                      >
                        {busy ? 'Waiting' : 'Open refunds'}
                      </button>
                    )}
                    {row.view.stage === 'waiting' && (
                      <span className="rf-wait">nothing to do yet</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {shown.some((row) => row.view.stage === 'openable') && (
            <p className="rf-note rf-note--tight">
              Opening refunds is one transaction that covers the whole market, so
              you pay the gas once and everybody who backed it can then claim.
              You still have to claim yours afterwards.
            </p>
          )}

          {error && (
            <p className="rf-error" role="alert">
              {error}
            </p>
          )}

          {done && (
            <p className="rf-done">
              {done.action === 'open'
                ? 'Refunds are open on that market. Claim yours below once the read catches up.'
                : 'Your stake is on its way back.'}{' '}
              <a href={txUrl(chainKey, done.hash)} target="_blank" rel="noreferrer">
                See the transaction
              </a>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
