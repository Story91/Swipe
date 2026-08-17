'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useActiveChain } from '@/lib/chains/activeChain';
import type { ChainKey } from '@/lib/chains';
import type { StakeToken } from '@/lib/userStake';

/**
 * One read of /api/portfolio, shared by the three screens built on it.
 *
 * It exists because the same two bugs were in all three copies.
 *
 * The first: a failed read wrote an empty list. Every screen did
 * `setLoading(true)` on its 30 second refresh and rendered a loading state in
 * place of the rows, and on a rejected promise rendered an error page in place
 * of them. Both turn a flaky network into "you have no positions", which is a
 * different fact from "we could not read them". Here the last good rows stay in
 * state and the failure is reported next to them.
 *
 * The second: the chain. The route defaults to Base when no ?chain= arrives, so
 * a request without one is a request for Base's positions whatever the switcher
 * says. The URL is built in one place now and the effect that builds it lists
 * chainKey, so the interval it starts cannot keep re-reading the chain the user
 * has left.
 */

export interface PortfolioRow {
  id: string;
  question: string;
  category: string;
  /** Already in `token`'s own readable units. Never divide these again. */
  stakeAmount: number;
  /** ETH, SWIPE, or the collateral leg. Absent only on very old rows. */
  token?: StakeToken;
  choice: 'YES' | 'NO';
  status: 'active' | 'won' | 'lost' | 'pending';
  potentialPayout: number;
  profit: number;
  createdAt: number;
  imageUrl: string;
  /** The market's own deadline, unix seconds. */
  deadline: number;
  yesPool: number;
  noPool: number;
  /** How the market settled, once it has. */
  outcome?: 'YES' | 'NO';
}

export interface TokenTotals {
  invested: number;
  payout: number;
  profit: number;
  bets: number;
}

export interface PortfolioStats {
  /** The collateral leg's totals. `totalsToken` says which token that is. */
  totalInvested: number;
  totalPayout: number;
  totalProfit: number;
  totalsToken?: StakeToken;
  /** Every token's own totals. Nothing is summed across them. */
  byToken?: Record<StakeToken, TokenTotals>;
  activeBets: number;
  wonBets: number;
  lostBets: number;
  winRate: number;
}

export interface PortfolioRead {
  /** The chain these figures are about, for labels and for symbols. */
  chainKey: ChainKey;
  /** null means not read yet. An empty array means read, and there are none. */
  rows: PortfolioRow[] | null;
  /**
   * The route's own summary. Carried because it is what the route sends, and
   * read by nobody today: the screens total the rows themselves so that a
   * ledger and the list under it cannot disagree, and so that a book held
   * entirely in ETH does not get a headline of 0.00 in the collateral.
   */
  stats: PortfolioStats | null;
  /** A read is in flight. Not the same as having nothing. */
  loading: boolean;
  /** The last read failed. Anything in `rows` is still the last good answer. */
  error: string | null;
  refresh: () => void;
}

const REFRESH_MS = 30_000;

export function usePortfolio(address: string | undefined): PortfolioRead {
  const { chainKey } = useActiveChain();
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);

  // What is held is tagged with the wallet and chain it came from. A switch
  // therefore drops it rather than relabelling Base's positions as Robinhood's,
  // and it does so in the same render as the switch, with no window where the
  // old figures sit under the new chain's name.
  const identity = `${address ?? ''}:${chainKey}`;
  const [held, setHeld] = useState<{
    identity: string;
    rows: PortfolioRow[];
    stats: PortfolioStats | null;
  } | null>(null);
  const [failure, setFailure] = useState<{ identity: string; message: string } | null>(null);

  useEffect(() => {
    if (!address) {
      setBusy(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setBusy(true);
      try {
        const response = await fetch(`/api/portfolio?userAddress=${address}&chain=${chainKey}`);
        if (!response.ok) {
          throw new Error(`the portfolio service answered ${response.status}`);
        }

        const body = await response.json();
        if (!body?.success) {
          throw new Error(body?.error || 'the portfolio service refused the request');
        }
        if (cancelled) return;

        setHeld({
          identity,
          rows: Array.isArray(body.data?.portfolio) ? body.data.portfolio : [],
          stats: body.data?.stats ?? null,
        });
        setFailure(null);
      } catch (err) {
        if (cancelled) return;
        // Deliberately no setHeld here. Whatever was read last is still the
        // best answer available, and replacing it with [] would report an
        // outage as an empty book.
        setFailure({
          identity,
          message: err instanceof Error ? err.message : 'the portfolio could not be read',
        });
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    load();
    const timer = setInterval(load, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // chainKey belongs here. It starts at the build-time default and only picks
    // up the stored preference after mount, so an effect without it reads Base
    // once and then keeps reading Base every 30 seconds from the closure the
    // interval captured, while the switcher happily shows another chain's name.
  }, [address, chainKey, identity, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return useMemo(
    () => ({
      chainKey,
      rows: held?.identity === identity ? held.rows : null,
      stats: held?.identity === identity ? held.stats : null,
      loading: busy,
      error: failure?.identity === identity ? failure.message : null,
      refresh,
    }),
    [chainKey, held, identity, busy, failure, refresh]
  );
}
