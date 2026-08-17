'use client';

import React from 'react';
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
}

const WEIGHTS = [
  { label: '×1.50', when: 'First quarter' },
  { label: '×1.25', when: 'Second quarter' },
  { label: '×1.00', when: 'Second half' },
] as const;

function units(raw: number, decimals: number): number {
  return raw / 10 ** decimals;
}

/** Two sides and the bar between them, for one token. */
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

  return (
    <section className="mkpool">
      <header className="mkpool__head">
        <h3 className="mkpool__title">{title}</h3>
        <span className="mkpool__total">{total}</span>
      </header>

      <div className="mkpool__sides">
        <div className="mkpool__side mkpool__side--yes">
          <span className="mkpool__side-label">Yes</span>
          <span className="mkpool__side-amount">{format(yes)}</span>
        </div>
        <div className="mkpool__side mkpool__side--no">
          <span className="mkpool__side-label">No</span>
          <span className="mkpool__side-amount">{format(no)}</span>
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
}: MarketPoolsProps) {
  const now = Math.floor(Date.now() / 1000);
  const bracket = weightBracket(now, createdAt, deadline);
  const settled = deadline > 0 && now >= deadline;

  const collateral = (n: number) =>
    units(n, decimals).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const total = units(yes + no, decimals);

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
        total={`${collateral(yes + no)} ${symbol}`}
        yes={yes}
        no={no}
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
            {participants} {participants === 1 ? 'backer' : 'backers'}
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
