'use client';

import React, { useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useActiveChain } from '@/lib/chains/activeChain';
import { COLLATERAL_LEG, toDisplayUnits, tokenSymbol, type StakeToken } from '@/lib/userStake';
import { useProductPanelData, type MarketCensusView } from './useProductPanelData';
import { useCountUp } from './useCountUp';
import { formatCount, formatMoney } from './panelFormat';
import { ActivitySlider } from './ActivitySlider';
import './ProductPanels.css';

/**
 * Product content shared by two surfaces:
 *   layout="bar"  - a horizontal strip above the market grid
 *   layout="rail" - a vertical stack inside the desktop side panels
 *
 * One implementation, two arrangements, so the two surfaces cannot drift apart.
 *
 * WHAT THE NUMBERS SAY NOW
 *
 * This strip used to print MARKETS 245 and VOLUME 0.391 ETH. Both were wrong
 * and both were wrong at the source, so they are fixed in
 * /api/market/compact-stats rather than relabelled here. 245 was every record
 * in the chain's namespace, archived contracts and unaccepted proposals
 * included. The volume was the archived ETH pools in wei, a figure that stopped
 * moving the day those contracts were archived and names a token the app does
 * not settle in. See app/components/Panels/marketCensus.ts.
 *
 * The live dot is lit only after a read came back. It is a claim about data,
 * not a decoration, and a dot that pulses while a request is in flight is a lie
 * with an animation on it.
 *
 * MOTION. The vocabulary is borrowed from app/components/Market/SwipeTokenCard,
 * which set it: panels rise in on a stagger, a lime beam sweeps the top edge,
 * the live dot pulses, and the feed scrolls. The counters and the slider run on
 * animation frames in JavaScript and are switched off through
 * usePrefersReducedMotion; everything else is switched off in the reduce block
 * at the bottom of ProductPanels.css.
 */

type Layout = 'bar' | 'rail';
export type PanelSection = 'claim' | 'stats' | 'activity';

const ALL_SECTIONS: PanelSection[] = ['claim', 'stats', 'activity'];

export function ProductPanels({
  layout,
  sections = ALL_SECTIONS,
}: {
  layout: Layout;
  /** Which blocks to render. Lets the two side rails show different content
      while still going through one implementation. */
  sections?: PanelSection[];
}) {
  const { address } = useAccount();
  const { chainKey, chain } = useActiveChain();
  const { census, activity, claimCount, loading, statsLive, activityLive } =
    useProductPanelData(address);

  const symbolFor = useCallback(
    (token: StakeToken) => tokenSymbol(token, chainKey),
    [chainKey]
  );

  const show = (s: PanelSection) => sections.includes(s);

  return (
    <div className={`pp pp--${layout}`}>
      {show('claim') && claimCount !== null && claimCount > 0 && (
        <section className="pp-panel pp-panel--claim">
          <span className="pp-panel__beam" aria-hidden="true" />
          <header className="pp-panel__head">
            <h3 className="pp-panel__title">Ready to claim</h3>
            <LiveDot live />
          </header>
          <ClaimCount count={claimCount} />
          <p className="pp-panel__note">
            {claimCount === 1 ? 'market is' : 'markets are'} holding money with your
            name on it.
          </p>
        </section>
      )}

      {show('stats') && (
        <section className="pp-panel pp-panel--stats">
          <span className="pp-panel__beam" aria-hidden="true" />
          <header className="pp-panel__head">
            <h3 className="pp-panel__title">{chain.label} market</h3>
            <LiveDot live={statsLive} />
          </header>
          <StatsBody
            census={census}
            live={statsLive}
            loading={loading}
            label={chain.label}
          />
        </section>
      )}

      {show('activity') && (
        <section className="pp-panel pp-panel--feed">
          <span className="pp-panel__beam" aria-hidden="true" />
          <header className="pp-panel__head">
            <h3 className="pp-panel__title">Recent activity</h3>
            <LiveDot live={activityLive} />
          </header>

          {!activityLive ? (
            <p className="pp-panel__status">
              {loading
                ? `Reading the feed on ${chain.label}.`
                : `The feed did not answer for ${chain.label}. Reload to try again.`}
            </p>
          ) : activity.length === 0 ? (
            <p className="pp-panel__status">
              Nothing has happened on {chain.label} yet. The first bet lands here.
            </p>
          ) : (
            <>
              <ActivitySlider
                items={activity}
                symbolFor={symbolFor}
                label={`Recent activity on ${chain.label}`}
              />
              <p className="pp-panel__hint">Drag to move it, hover to hold it still.</p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * The four figures, or a sentence saying why there are none.
 *
 * Split out so the empty cases read as themselves rather than as a chain of
 * ternaries wrapped around a grid.
 */
function StatsBody({
  census,
  live,
  loading,
  label,
}: {
  census: MarketCensusView | null;
  live: boolean;
  loading: boolean;
  label: string;
}) {
  if (!live || !census) {
    // A read that failed says so. "Reading" that never ends is the state this
    // panel was in before, and it looks identical to a slow network.
    return (
      <p className="pp-panel__status">
        {loading
          ? `Reading the market on ${label}.`
          : `The market did not answer for ${label}. Reload to try again.`}
      </p>
    );
  }

  if (census.markets === 0) {
    return (
      <>
        <p className="pp-panel__status">
          {label} has nothing on the live contract yet.
        </p>
        <Footnote census={census} />
      </>
    );
  }

  // Raw six decimal collateral, converted at the edge with the same helper
  // every other stored amount goes through. Never added to the ETH figure that
  // sits beside it in the API response: that one is wei.
  const pooled = toDisplayUnits(census.pooledRaw, COLLATERAL_LEG);

  return (
    <>
      <dl className="pp-stats">
        <Stat label="Open" value={census.open} format={formatCount} accent live={live} />
        <Stat label="Markets" value={census.markets} format={formatCount} live={live} />
        <Stat label="Players" value={census.players} format={formatCount} live={live} />
        <Stat
          label="Pooled"
          value={pooled}
          decimals={2}
          format={formatMoney}
          unit={census.symbol}
          live={live}
        />
      </dl>
      <Footnote census={census} />
    </>
  );
}

/**
 * What the four figures deliberately leave out.
 *
 * The archive is real and it is large, so it is stated rather than quietly
 * folded into the counts above. Same for proposals: a market nobody has
 * accepted is not a market you can bet on.
 */
function Footnote({ census }: { census: MarketCensusView }) {
  const parts: string[] = [];
  if (census.archived > 0) {
    parts.push(
      `${formatCount(census.archived)} older ${census.archived === 1 ? 'market sits' : 'markets sit'} on contracts nobody can resolve any more.`
    );
  }
  if (census.awaiting > 0) {
    parts.push(
      `${formatCount(census.awaiting)} ${census.awaiting === 1 ? 'proposal is' : 'proposals are'} waiting on a decision.`
    );
  }
  if (parts.length === 0) return null;
  return <p className="pp-panel__note">{parts.join(' ')}</p>;
}

/**
 * One figure, running up to itself once the read has landed.
 *
 * `live` gates the counter for the same reason it gates the dot. Counting up to
 * zero while a request is still out looks exactly like counting up to a real
 * zero, and only one of those is true.
 */
function Stat({
  label,
  value,
  format,
  live,
  decimals = 0,
  unit,
  accent = false,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  live: boolean;
  decimals?: number;
  unit?: string;
  accent?: boolean;
}) {
  const shown = useCountUp(value, live, decimals);

  return (
    <div className={`pp-stat${accent ? ' pp-stat--accent' : ''}`}>
      <dt className="pp-stat__label">{label}</dt>
      <dd className="pp-stat__value">
        {format(shown)}
        {unit && <span className="pp-stat__unit">{unit}</span>}
      </dd>
    </div>
  );
}

/** The claim count gets the same treatment as the market figures. */
function ClaimCount({ count }: { count: number }) {
  const shown = useCountUp(count, true);
  return <p className="pp-claim__count">{formatCount(shown)}</p>;
}

/** Lit only once something was actually read. See the note at the top. */
function LiveDot({ live }: { live: boolean }) {
  return (
    <span className="pp-live">
      <span className={`pp-live__dot pp-live__dot--${live ? 'on' : 'off'}`} aria-hidden="true" />
      <span className="pp-live__word">{live ? 'live' : 'reading'}</span>
    </span>
  );
}

export default ProductPanels;
