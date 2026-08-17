'use client';

import React from 'react';
import { Clock, DollarSign, Users } from 'lucide-react';
import { formatDeadline, formatPool } from './marketDetail';

/**
 * Pool, bettors, ends. Three figures, no state.
 *
 * The bettor count is `usdcParticipants`, not `participants`. The latter is the
 * V2 array and is empty on every market the app can currently bet on, which is
 * the same reason this page used to print a pool of zero: it was reading the
 * wrong side of the record. The USDC markets screen still passes the V2 array
 * here; that is a bug there and is not copied.
 */
export function MarketStatsRow({
  totalPool,
  bettors,
  deadline,
  decimals,
  archived,
}: {
  totalPool: number;
  bettors: number;
  deadline: number;
  decimals: number;
  archived?: boolean;
}) {
  return (
    <dl className="mdet-stats">
      <div className="mdet-stat">
        <dt>
          <DollarSign className="w-4 h-4" aria-hidden="true" />
          Pool
        </dt>
        <dd>{formatPool(totalPool, decimals)}</dd>
      </div>

      <div className="mdet-stat">
        <dt>
          <Users className="w-4 h-4" aria-hidden="true" />
          Bettors
        </dt>
        <dd>{bettors}</dd>
      </div>

      <div className="mdet-stat">
        <dt>
          <Clock className="w-4 h-4" aria-hidden="true" />
          Ends
        </dt>
        {/* A countdown on an archived market is a lie with a clock on it: the
            deadline is real, but nothing can be staked against it. */}
        <dd>{archived ? 'Archived' : formatDeadline(deadline)}</dd>
      </div>
    </dl>
  );
}

export default MarketStatsRow;
