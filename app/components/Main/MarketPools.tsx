'use client';

import React from 'react';
import { useReadContract } from 'wagmi';
import { weightBracket } from './weightBracket';
import './MarketPools.css';

/**
 * What is actually staked on a market, and what the contract will do with it.
 *
 * This replaces two panels that sat under the swipe card reading ETH_POOL and
 * SWIPE_POOL. Both took their numbers from the archived V2 fields, so on every
 * market the app now makes they showed 0.00000 ETH and "No SWIPE stakes yet"
 * while the real pool, in the chain's collateral, was not on screen at all. The
 * labels were wrong twice over: wrong token, and a token this contract cannot
 * even hold.
 *
 * The old panels are not deleted, they are made conditional. 245 archived
 * markets do hold ETH and SWIPE and people still need to see them, so a leg is
 * rendered when it has something in it and left out when it does not.
 *
 * The weighting strip is new. The contract multiplies a stake by when it landed
 * and that decides the payout, so it belongs next to the pool rather than in the
 * FAQ. Brackets are the contract's own, from weightBpsAt: first quarter 1.50,
 * second quarter 1.25, the whole second half 1.00. Note that is a half, not a
 * quarter; the third and fourth quarters pay the same.
 */

export interface MarketPoolsProps {
  /** Raw collateral units, as the contract stores them. */
  yes: number;
  no: number;
  decimals: number;
  /** The chain's own symbol, USDC on Base and USDG on Robinhood. Never a literal. */
  symbol: string;
  /** Unix seconds. Absent on records written before the field existed. */
  createdAt?: number;
  deadline: number;
  platformFeeBps: number;
  creatorFeeBps: number;
  /** Already in display units. */
  minBet: string;
  participants: number;
  /** Archived legs, raw 18 decimal units. Rendered only when non-zero. */
  ethYes: number;
  ethNo: number;
  swipeYes: number;
  swipeNo: number;
  /**
   * The live market, so the pools can be read from it rather than from Redis.
   *
   * The `yes` and `no` above come through the listing, which is served from a
   * denormalised snapshot rebuilt only when something invalidates it. That is
   * why a bet used to need a manual refresh before it showed up here. Given
   * these, the contract is asked directly and the snapshot becomes the fallback
   * for the first paint and for a chain that will not answer.
   *
   * wagmi keys a read by address, function, args and chain, so the identical
   * read in YourPosition is the same query and costs one request, not two.
   */
  marketAddress?: `0x${string}`;
  abi?: readonly unknown[];
  chainId?: number;
  numericId?: number;
}

const WEIGHTS = [
  { label: '×1.50', when: 'First quarter' },
  { label: '×1.25', when: 'Second quarter' },
  { label: '×1.00', when: 'Second half' },
] as const;

function units(raw: number, decimals: number): number {
  return raw / 10 ** decimals;
}

/**
 * The pools as the contract has them, or null until it answers.
 *
 * predictions(id) returns sixteen values; the four read here are yesPool at 3,
 * noPool at 4, createdAt at 11 and participantCount at 15. Indexed rather than
 * named because the ABI returns a tuple, which is why marketPools.test.ts
 * asserts the struct's field order against the .sol file: an inserted field
 * would otherwise shift these silently and put a timestamp where a pool goes.
 */
function useLivePools(params: {
  marketAddress?: `0x${string}`;
  abi?: readonly unknown[];
  chainId?: number;
  numericId?: number;
}): { yes: number; no: number; createdAt: number; participants: number } | null {
  const { marketAddress, abi, chainId, numericId } = params;
  const enabled = Boolean(marketAddress && abi && numericId && numericId > 0);

  const { data } = useReadContract({
    address: marketAddress,
    abi: abi as never,
    functionName: 'predictions',
    args: numericId ? [BigInt(numericId)] : undefined,
    chainId,
    query: {
      enabled,
      // Someone else betting changes these, so a poll is the only way the card
      // stays honest while it sits open.
      refetchInterval: 15_000,
    },
  });

  if (!data) return null;
  const row = data as readonly bigint[];
  if (row.length < 16) return null;
  if (!row[0]) return null; // not registered on chain

  return {
    yes: Number(row[3]),
    no: Number(row[4]),
    createdAt: Number(row[11]),
    participants: Number(row[15]),
  };
}

/** Two sides and the bar between them, for one token. */
/**
 * Which side just grew, for one animation frame's worth of attention.
 *
 * A bet that lands changes a number by a small amount in a component that was
 * already on screen, which is easy to miss entirely. Marking the side that
 * moved is the difference between the page updating and the user seeing it
 * update. Cleared on a timer so it fires once rather than staying lit.
 */
function useBumped(yes: number, no: number): 'yes' | 'no' | null {
  const previous = React.useRef({ yes, no });
  const [bumped, setBumped] = React.useState<'yes' | 'no' | null>(null);

  React.useEffect(() => {
    const before = previous.current;
    previous.current = { yes, no };
    // Only growth. A pool shrinks when somebody exits, and flashing the number
    // green for that would read as a bet arriving.
    const side = yes > before.yes ? 'yes' : no > before.no ? 'no' : null;
    if (!side) return;
    setBumped(side);
    const timer = setTimeout(() => setBumped(null), 700);
    return () => clearTimeout(timer);
  }, [yes, no]);

  return bumped;
}

function Pool({
  title,
  total,
  yes,
  no,
  format,
  emptyNote,
}: {
  title: string;
  total: string;
  yes: number;
  no: number;
  format: (n: number) => string;
  emptyNote: string;
}) {
  const sum = yes + no;
  const yesPercent = sum > 0 ? (yes / sum) * 100 : 50;
  const bumped = useBumped(yes, no);

  return (
    <section className="mkpool">
      <header className="mkpool__head">
        <h3 className="mkpool__title">{title}</h3>
        <span className="mkpool__total">{total}</span>
      </header>

      <div className="mkpool__sides">
        <div className="mkpool__side mkpool__side--yes">
          <span className="mkpool__side-label">Yes</span>
          <span className={`mkpool__side-amount${bumped === 'yes' ? ' mkpool__side-amount--bumped' : ''}`}>
            {format(yes)}
          </span>
        </div>
        <div className="mkpool__side mkpool__side--no">
          <span className="mkpool__side-label">No</span>
          <span className={`mkpool__side-amount${bumped === 'no' ? ' mkpool__side-amount--bumped' : ''}`}>
            {format(no)}
          </span>
        </div>
      </div>

      {sum === 0 ? (
        <p className="mkpool__empty">{emptyNote}</p>
      ) : (
        <div className="mkpool__bar-wrap">
          <div className="mkpool__bar" role="img" aria-label={`${yesPercent.toFixed(0)} percent yes`}>
            <span className="mkpool__bar-yes" style={{ width: `${yesPercent}%` }} />
            <span className="mkpool__bar-no" style={{ width: `${100 - yesPercent}%` }} />
          </div>
          <div className="mkpool__bar-labels">
            <span>{yesPercent.toFixed(1)}%</span>
            <span>{(100 - yesPercent).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </section>
  );
}

export function MarketPools({
  yes,
  no,
  decimals,
  symbol,
  createdAt,
  deadline,
  platformFeeBps,
  creatorFeeBps,
  minBet,
  participants,
  ethYes,
  ethNo,
  swipeYes,
  swipeNo,
  marketAddress,
  abi,
  chainId,
  numericId,
}: MarketPoolsProps) {
  const live = useLivePools({ marketAddress, abi, chainId, numericId });
  // The chain when it answers, the snapshot until it does. Both are raw units
  // in the same decimals, so nothing downstream has to know which it got.
  const yesNow = live?.yes ?? yes;
  const noNow = live?.no ?? no;
  const backersNow = live?.participants ?? participants;
  // createdAt from the contract is the real one. The record's is fabricated as
  // deadline minus a day on some paths, and the weighting strip is exactly the
  // thing that must not be computed from a guess.
  const openedAt = live?.createdAt ?? createdAt;

  const now = Math.floor(Date.now() / 1000);
  const bracket = weightBracket(now, openedAt, deadline);
  const settled = deadline > 0 && now >= deadline;

  const collateral = (n: number) =>
    units(n, decimals).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const total = units(yesNow + noNow, decimals);

  const hasEth = ethYes + ethNo > 0;
  const hasSwipe = swipeYes + swipeNo > 0;

  // Narrowed here rather than inline, because -1 means "the record does not
  // say" and indexing WEIGHTS with it would read off the end of the array.
  const current = bracket === -1 ? undefined : WEIGHTS[bracket];
  const weightNote = settled
    ? 'Betting is closed on this one.'
    : current
      ? `A bet placed right now counts ${current.label} when the losing pool is divided. The weight is fixed the moment you bet.`
      : 'Bets are weighted by how early they land. This market does not record when it opened, so the multiplier is not shown rather than guessed.';

  const feeLine = platformFeeBps + creatorFeeBps > 0
    ? `${(platformFeeBps / 100).toFixed(platformFeeBps % 100 ? 2 : 0)}% to the platform and ` +
      `${(creatorFeeBps / 100).toFixed(creatorFeeBps % 100 ? 2 : 0)}% to whoever opened it, ` +
      'taken from the losing side only. Your own stake comes back whole when you win.'
    : 'Fees come out of the losing side only. Your own stake comes back whole when you win.';

  return (
    <div className="mkpools">
      <Pool
        title={`${symbol} pool`}
        total={`${collateral(yesNow + noNow)} ${symbol}`}
        yes={yesNow}
        no={noNow}
        format={collateral}
        emptyNote={
          total === 0
            ? `Nothing staked yet. The first bet sets the odds, and the minimum is ${minBet} ${symbol}.`
            : ''
        }
      />

      <section className="mkpool mkpool--rules">
        <header className="mkpool__head">
          <h3 className="mkpool__title">How this one pays</h3>
          <span className="mkpool__total">
            {backersNow} {backersNow === 1 ? 'backer' : 'backers'}
          </span>
        </header>

        <div className="mkpool__weights">
          {WEIGHTS.map((w, i) => (
            <div
              key={w.when}
              className={`mkpool__weight${i === bracket && !settled ? ' mkpool__weight--now' : ''}`}
            >
              <span className="mkpool__weight-x">{w.label}</span>
              <span className="mkpool__weight-when">{w.when}</span>
            </div>
          ))}
        </div>

        <p className="mkpool__note">{weightNote}</p>
        <p className="mkpool__note mkpool__note--quiet">{feeLine}</p>
      </section>

      {hasEth && (
        <Pool
          title="ETH pool, archived"
          total={`${units(ethYes + ethNo, 18).toFixed(5)} ETH`}
          yes={ethYes}
          no={ethNo}
          format={(n) => units(n, 18).toFixed(5)}
          emptyNote=""
        />
      )}

      {hasSwipe && (
        <Pool
          title="SWIPE pool, archived"
          total={`${units(swipeYes + swipeNo, 18).toLocaleString(undefined, { maximumFractionDigits: 0 })} SWIPE`}
          yes={swipeYes}
          no={swipeNo}
          format={(n) => units(n, 18).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          emptyNote=""
        />
      )}

      {(hasEth || hasSwipe) && (
        <p className="mkpools__archived">
          This market predates the current contract. Those pools take no new bets,
          and nobody holds the key that could settle them.
        </p>
      )}
    </div>
  );
}

export default MarketPools;
