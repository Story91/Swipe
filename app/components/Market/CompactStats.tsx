'use client';

import React, { useEffect, useState } from 'react';
import { useActiveChain } from '@/lib/chains/activeChain';
import { getChainConfig } from '@/lib/chains';
import { getMarketContract } from '@/lib/chains/market';
import { formatAmount, formatBps, MARKET_PROBE_LIMIT } from '@/lib/chains/chainSummary';
import { COLLATERAL_LEG, tokenSymbol } from '@/lib/userStake';
import {
  archivedVolume,
  readLiveMarketStats,
  type ArchivedVolume,
  type LiveMarketStats,
} from './liveMarketStats';
import './CompactStats.css';

/**
 * The stats tab.
 *
 * What was here before was covered by a ComingSoonOverlay, and the overlay was
 * right: the screen underneath printed an ETH total and a $SWIPE total from
 * contracts nobody controls any more, a resolution rate labelled "win rate", and
 * an average stake of 0.00045 ETH that was typed into the markup. None of it
 * described the live market, which settles in the chain's stablecoin.
 *
 * The rebuild splits the page by where a number comes from, and says so on the
 * page rather than only here. The live block is read from the V4 contract on the
 * selected chain at load. The archived block is the old ETH and $SWIPE legs out
 * of Redis, kept in their own tokens and never added to anything. The last block
 * names what is missing and why, because a stats page that quietly omits volume
 * reads as a stats page with no volume.
 *
 * Most live figures are zero today, on both chains, because there is one market
 * and nobody has bet on it. Zero is the answer and it is printed as zero.
 */

const WEIGHTS = [
  { label: '×1.50', when: 'First quarter' },
  { label: '×1.25', when: 'Second quarter' },
  { label: '×1.00', when: 'Second half' },
] as const;

type LiveState =
  | { status: 'loading' }
  | { status: 'ready'; stats: LiveMarketStats }
  | { status: 'absent' }
  | { status: 'error' };

type ArchiveState =
  | { status: 'loading' }
  | { status: 'ready'; volume: ArchivedVolume | null }
  | { status: 'error' };

export function CompactStats() {
  // Every read below travels with the active chain. The stats API defaults to
  // Base when no chain is sent, which is right for Base and wrong for every
  // other chain, and the contract reads have no default at all.
  const { chainKey } = useActiveChain();
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState<LiveState>({ status: 'loading' });
  const [archive, setArchive] = useState<ArchiveState>({ status: 'loading' });

  const label = getChainConfig(chainKey).label;
  // Named from the chain config so the page can say which token it is about
  // before the contract answers. Once the read lands, the symbol the contract
  // reports takes over for anything with a number next to it, because that one
  // cannot be stale.
  const configSymbol = tokenSymbol(COLLATERAL_LEG, chainKey);

  useEffect(() => {
    let cancelled = false;

    // Asked before the read rather than inferred from the failure. A chain with
    // no contract deployed is an answer, not an outage, and the two have to read
    // differently: nothing to count, against nothing reachable.
    if (!getMarketContract(chainKey)) {
      setLive({ status: 'absent' });
      return;
    }

    setLive({ status: 'loading' });
    readLiveMarketStats(chainKey)
      .then((stats) => {
        if (!cancelled) setLive({ status: 'ready', stats });
      })
      .catch(() => {
        if (!cancelled) setLive({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [chainKey, attempt]);

  useEffect(() => {
    let cancelled = false;
    setArchive({ status: 'loading' });

    // Fetched separately from the contract read and allowed to fail on its own.
    // The archive is history; losing it must not blank the live figures.
    fetch(`/api/market/compact-stats?chain=${chainKey}`)
      .then((response) => response.json())
      .then((payload: unknown) => {
        if (!cancelled) setArchive({ status: 'ready', volume: archivedVolume(payload) });
      })
      .catch(() => {
        if (!cancelled) setArchive({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [chainKey, attempt]);

  return (
    <div className="compact-stats">
      <p className="compact-stats__intro">
        Markets on {label} settle in {configSymbol}. The live figures below are read
        from the contract when this page opens. The archived ones come from the
        app&apos;s own record of the old contracts on this network, and nothing here
        crosses between networks.
      </p>

      {live.status === 'loading' && (
        <section className="compact-stats__card">
          <p className="compact-stats__status">Reading the contract on {label}.</p>
        </section>
      )}

      {live.status === 'absent' && (
        <section className="compact-stats__card">
          <header className="compact-stats__head">
            <h3 className="compact-stats__title">No market on {label}</h3>
          </header>
          <p className="compact-stats__note">
            Swipe has no contract deployed on this network, so there is nothing to
            count. The other networks are unaffected.
          </p>
        </section>
      )}

      {live.status === 'error' && (
        <section className="compact-stats__card">
          <header className="compact-stats__head">
            <h3 className="compact-stats__title">{label} did not answer</h3>
          </header>
          <p className="compact-stats__note">
            The figures are left out rather than shown from an earlier read, because a
            stale pool is worse than no pool.
          </p>
          <button
            type="button"
            className="compact-stats__retry"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        </section>
      )}

      {live.status === 'ready' && <LiveBlocks label={label} stats={live.stats} />}

      {archive.status === 'ready' && archive.volume && (
        <section className="compact-stats__card compact-stats__card--archive">
          <header className="compact-stats__head">
            <h3 className="compact-stats__title">Old contracts on {label}</h3>
            <span className="compact-stats__badge">archived</span>
          </header>

          <dl className="compact-stats__rows">
            <Row
              label="ETH volume"
              value={`${archive.volume.eth.toFixed(5)} ETH`}
            />
            <Row
              label="SWIPE volume"
              value={`${archive.volume.swipe.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })} SWIPE`}
            />
          </dl>

          <p className="compact-stats__note">
            Two tokens, two numbers, and neither of them is dollars. They are not added
            to each other and they are not added to the pools above.
          </p>
          <p className="compact-stats__note compact-stats__note--quiet">
            Those contracts take no new bets. Nobody holds the key that could settle
            what is still in them.
          </p>
        </section>
      )}

      {archive.status === 'error' && (
        <p className="compact-stats__status">
          The archived ETH and $SWIPE figures did not load. Everything above is
          unaffected.
        </p>
      )}

      <section className="compact-stats__card compact-stats__card--gaps">
        <header className="compact-stats__head">
          <h3 className="compact-stats__title">Not here yet</h3>
        </header>

        <div className="compact-stats__gap">
          <p className="compact-stats__gap-title">Lifetime volume</p>
          <p className="compact-stats__note">
            Everything a market has ever taken lives in the contract&apos;s event log,
            and the public Base RPC refuses a log query reaching back to the first
            block. Until an indexer serves that, what is in the pools now is the closest
            honest answer.
          </p>
        </div>

        <div className="compact-stats__gap">
          <p className="compact-stats__gap-title">Win rates and a leaderboard</p>
          <p className="compact-stats__note">
            Both need markets that have finished. None on these contracts has, so there
            is no rate to compute and ranking a single empty market would be theatre.
          </p>
        </div>
      </section>

      <p className="compact-stats__footnote">
        Nothing is totalled across networks. Each one holds its own collateral in its
        own contract, so a figure spanning both would be two different tokens added
        together.
      </p>
    </div>
  );
}

function LiveBlocks({ label, stats }: { label: string; stats: LiveMarketStats }) {
  const { chain, markets } = stats;
  const symbol = chain.collateral.symbol;
  const decimals = chain.collateral.decimals;

  const count = (n: number) => n.toLocaleString();
  const registered = markets.countIsFloor
    ? `${count(markets.registered)}+`
    : count(markets.registered);

  return (
    <>
      <section className="compact-stats__card">
        <header className="compact-stats__head">
          <h3 className="compact-stats__title">On {label} right now</h3>
          <span className="compact-stats__badge">{symbol}</span>
        </header>

        <dl className="compact-stats__rows">
          <Row label="markets registered" value={registered} />
          <Row label="taking bets" value={count(markets.open)} />
          <Row label="waiting to settle" value={count(markets.awaiting)} />
          <Row label="settled" value={count(markets.settled)} />
          {markets.cancelled > 0 && (
            <Row label="cancelled" value={count(markets.cancelled)} />
          )}
          <Row
            label="staked in the pools"
            value={`${formatAmount(markets.staked, decimals, 2)} ${symbol}`}
          />
          <Row label="backers" value={count(markets.backers)} />
        </dl>

        <p className="compact-stats__note">
          Staked is what sits in the pools at this moment. It falls when somebody exits
          a position early, so it is a balance rather than a running total.
        </p>
        <p className="compact-stats__note compact-stats__note--quiet">
          Backers counts positions per market, so one person betting on two markets
          counts twice.
        </p>
        {markets.countIsFloor && (
          <p className="compact-stats__note compact-stats__note--quiet">
            The first {MARKET_PROBE_LIMIT} market ids were probed and the last one was
            taken, so every count here is a floor.
          </p>
        )}
      </section>

      <section className="compact-stats__card compact-stats__card--rules">
        <header className="compact-stats__head">
          <h3 className="compact-stats__title">How a bet pays here</h3>
          <span className="compact-stats__badge">live rates</span>
        </header>

        <dl className="compact-stats__rows">
          <Row
            label="minimum bet"
            value={`${formatAmount(chain.minBet, decimals)} ${symbol}`}
          />
          <Row label="platform fee" value={formatBps(chain.fees.platformBps)} />
          <Row label="creator fee" value={formatBps(chain.fees.creatorBps)} />
          <Row label="early exit fee" value={formatBps(chain.fees.earlyExitBps)} />
        </dl>

        <div className="compact-stats__weights">
          {WEIGHTS.map((w) => (
            <div key={w.when} className="compact-stats__weight">
              <span className="compact-stats__weight-x">{w.label}</span>
              <span className="compact-stats__weight-when">{w.when}</span>
            </div>
          ))}
        </div>

        <p className="compact-stats__note">
          Both fees come off the losing side. Win, and your own stake comes back whole
          before you take a share of what the losers put up.
        </p>
        <p className="compact-stats__note compact-stats__note--quiet">
          That share is sized by how much you staked and by how early. The premium is
          gone by halfway, because the third quarter and the fourth both count 1.00.
        </p>
        <p className="compact-stats__note compact-stats__note--quiet">
          These four rates are read from the contract, not from a config file. They can
          be changed on chain, and this page will say so the next time it loads.
        </p>
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="compact-stats__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default CompactStats;
