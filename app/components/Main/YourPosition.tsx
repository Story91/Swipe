'use client';

import React from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { estimatePosition } from './positionMath';
import './YourPosition.css';

/**
 * What you have on this market, read from the contract rather than from Redis.
 *
 * The card never showed this. `userYesStake` and `userNoStake` existed on the
 * transformed prediction with a comment saying they would be filled in when
 * user stakes were fetched, and nothing ever filled them, so after placing a
 * bet the screen looked exactly as it had before. The pools moved by a rounding
 * amount and that was the entire feedback.
 *
 * Read straight from `positions(id, you)` on chain, for two reasons. It is the
 * authority, so nothing here can disagree with what the contract will pay. And
 * it does not wait for the sync to write Redis and for the listing snapshot to
 * be rebuilt, which is what made a bet take a manual refresh to appear.
 *
 * The payout figure is an estimate and says so. It is the contract's own
 * arithmetic applied to the pools as they stand: your weighted share of your
 * side, times the losing side, less the fees that come out of it. It moves as
 * other people bet, which is the nature of a parimutuel pool rather than a
 * defect.
 */

export interface YourPositionProps {
  marketAddress: `0x${string}`;
  abi: readonly unknown[];
  chainId: number;
  numericId: number;
  decimals: number;
  symbol: string;
  platformFeeBps: number;
  creatorFeeBps: number;
  resolved: boolean;
  outcome: boolean;
  cancelled: boolean;
}

/** positions(id, user) -> yesAmount, noAmount, weightedYes, weightedNo, claimed */
type Position = readonly [bigint, bigint, bigint, bigint, boolean];

/** predictions(id) has the two weighted pools at 5 and 6. */
type PredictionRow = readonly bigint[] & { length: 16 };

function toUnits(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

function money(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function YourPosition({
  marketAddress,
  abi,
  chainId,
  numericId,
  decimals,
  symbol,
  platformFeeBps,
  creatorFeeBps,
  resolved,
  outcome,
  cancelled,
}: YourPositionProps) {
  const { address } = useAccount();
  const enabled = Boolean(address) && numericId > 0;

  const { data: position } = useReadContract({
    address: marketAddress,
    abi: abi as never,
    functionName: 'positions',
    args: address ? [BigInt(numericId), address] : undefined,
    chainId,
    query: {
      enabled,
      // A pool moves when anyone bets, not only when you do, so the estimate
      // beside your stake goes stale on its own. Cheap read, short interval.
      refetchInterval: 15_000,
    },
  });

  const { data: row } = useReadContract({
    address: marketAddress,
    abi: abi as never,
    functionName: 'predictions',
    args: [BigInt(numericId)],
    chainId,
    query: { enabled, refetchInterval: 15_000 },
  });

  if (!enabled || !position) return null;

  const [yesAmount, noAmount, weightedYes, weightedNo, claimed] = position as Position;
  if (yesAmount === BigInt(0) && noAmount === BigInt(0)) return null;

  const backedYes = yesAmount >= noAmount;
  const staked = toUnits(yesAmount + noAmount, decimals);
  const mine = toUnits(backedYes ? yesAmount : noAmount, decimals);
  const myWeighted = toUnits(backedYes ? weightedYes : weightedNo, decimals);

  const pools = row as PredictionRow | undefined;
  const yesPool = pools ? toUnits(pools[3], decimals) : 0;
  const noPool = pools ? toUnits(pools[4], decimals) : 0;
  const weightedYesPool = pools ? toUnits(pools[5], decimals) : 0;
  const weightedNoPool = pools ? toUnits(pools[6], decimals) : 0;

  // The arithmetic lives in positionMath so it can be tested against the worked
  // example the manifesto and the FAQ both print. Two copies of a payout
  // calculation drift, and this is the one a user reads as their money.
  const { winnings, multiplier: earned } = estimatePosition({
    mine,
    myWeighted,
    myWeightedPool: backedYes ? weightedYesPool : weightedNoPool,
    losingPool: backedYes ? noPool : yesPool,
    platformFeeBps,
    creatorFeeBps,
  });

  const won = resolved && !cancelled && outcome === backedYes;
  const lost = resolved && !cancelled && outcome !== backedYes;

  return (
    <section className="yourpos">
      <header className="yourpos__head">
        <h3 className="yourpos__title">Your position</h3>
        <span className={`yourpos__side yourpos__side--${backedYes ? 'yes' : 'no'}`}>
          {backedYes ? 'Yes' : 'No'}
        </span>
      </header>

      <div className="yourpos__figures">
        <div className="yourpos__figure">
          <span className="yourpos__key">Staked</span>
          <span className="yourpos__val">
            {money(staked)} {symbol}
          </span>
        </div>
        <div className="yourpos__figure">
          <span className="yourpos__key">Counts as</span>
          <span className="yourpos__val">
            {money(myWeighted)} {/* weighted, which is what divides the losing pool */}
            <span className="yourpos__mult">×{earned.toFixed(2)}</span>
          </span>
        </div>
      </div>

      {cancelled ? (
        <p className="yourpos__note">
          This market was called off, so every backer takes their stake back. The
          weighting does not apply to a refund.
        </p>
      ) : lost ? (
        <p className="yourpos__note">
          It settled the other way, so this stake went to the winning side.
        </p>
      ) : (
        <>
          <div className="yourpos__figure yourpos__figure--wide">
            <span className="yourpos__key">{won ? 'You take' : 'If you are right'}</span>
            <span className="yourpos__val yourpos__val--win">
              {money(staked + winnings)} {symbol}
            </span>
          </div>
          <p className="yourpos__note">
            {won
              ? 'Settled your way. Collect it from the dashboard.'
              : `Your stake back plus ${money(winnings)} ${symbol} out of the losing side, on the pools as they stand. It moves as other people bet.`}
          </p>
        </>
      )}

      {claimed && <p className="yourpos__note yourpos__note--quiet">Already collected.</p>}
    </section>
  );
}

export default YourPosition;
