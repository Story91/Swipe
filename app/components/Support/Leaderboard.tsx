"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useActiveChain } from '@/lib/chains/activeChain';
import type { ChainKey } from '@/lib/chains/types';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { useFarcasterProfiles } from '@/lib/hooks/useFarcasterProfiles';
import {
  tokenSymbol,
  COLLATERAL_LEG,
  type StakeToken,
  type TokenTotals,
} from '@/lib/userStake';
import { collateralStaked } from './boardTotals';
import '../../styles/sheet.css';
import './Leaderboard.css';

/**
 * The standings on the contract that is actually taking bets.
 *
 * On the shared sheet (app/styles/sheet.css) rather than the lime card face
 * that MarketPools uses. That is a surface question, not a taste one: this is a
 * full dashboard panel with its own hero, the same slot Help & FAQ and Recent
 * activity sit in, so it gets the sheet. The lime face belongs to things that
 * sit on the swipe card, and the #0d0d0d panel belongs to dialogs floating over
 * the app.
 *
 * WHAT THIS FILE USED TO BE
 *
 * A screen nothing imported, with no stylesheet at all. Every class it named
 * (`leaderboard`, `podium-item`, `table-row`, `winrate-fill`, and twenty more)
 * was defined in no CSS file in the repo, so mounting it would have produced a
 * column of unstyled text. On top of that:
 *
 *  - It printed `{user.avatar || '👤'}` for every row. /api/leaderboard fills
 *    that field from `getRandomAvatar()`, a random pick out of fifteen emoji on
 *    every request, so a person's face changed each time the board refreshed.
 *    A random emoji is not identity, so it is gone and a Farcaster profile or a
 *    plain address stands in its place.
 *  - Profit was written `+{totalProfit.toFixed(2)}`, with the plus hardcoded, so
 *    a loss rendered as "+-0.50".
 *  - Average win rate divided by `leaderboard.length` with no guard, so an empty
 *    board printed NaN%.
 *  - A three-slot podium rendered whatever the top of the list was, which with
 *    one real user is one user on a podium.
 *  - The header read "Top performers on Dexter". The product is Swipe; Dexter is
 *    the old package name.
 *  - Any failed refresh replaced the whole screen with an error, wiping rows
 *    that were on screen and correct a second earlier. The refresh also raised
 *    the loading flag every sixty seconds, so the board blanked itself on a
 *    timer.
 *
 * WHAT THE FIGURES MEAN NOW
 *
 * /api/leaderboard returns `totalProfit` and `totalStaked` as the collateral leg
 * in readable units, with `totalsToken` naming the leg and `byToken` carrying
 * every leg separately. Nothing here adds across tokens. One raw ETH is 1e18 and
 * one raw USDC is 1e6, so a cross token sum is not a rounding problem on a
 * ranking, it is the whole ranking: a dust ETH position would outrank every real
 * bet. The archived legs are shown beside a row, never inside its total.
 */

/** Totals per token, in readable units, exactly as the route sends them. */
type ByToken = TokenTotals;

interface LeaderboardRow {
  rank: number;
  address: string;
  displayName: string;
  totalProfit: number;
  totalBets: number;
  winRate: number;
  totalStaked: number;
  /** What totalProfit and totalStaked are in. The board hardcoded ETH. */
  totalsToken?: StakeToken;
  byToken?: ByToken;
  predictionsCreated: number;
}

type SortKey = 'staked' | 'profit' | 'bets';
type Timeframe = '7d' | '30d' | 'all';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'staked', label: 'Staked' },
  { key: 'profit', label: 'Profit' },
  { key: 'bets', label: 'Settled' },
];

const RANGES: { key: Timeframe; label: string; window: string }[] = [
  { key: '7d', label: '7 days', window: 'the last 7 days' },
  { key: '30d', label: '30 days', window: 'the last 30 days' },
  { key: 'all', label: 'All', window: 'every market on record' },
];

/** What a loaded board answers. Held together so a stale answer is detectable. */
interface Loaded {
  chain: ChainKey;
  timeframe: Timeframe;
  rows: LeaderboardRow[];
}

function initials(profile: { display_name?: string | null } | undefined, address: string) {
  const name = profile?.display_name;
  if (name) {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  return address.slice(2, 4).toUpperCase();
}

/** Archived legs are 18 decimal tokens and print at a different scale. */
function archivedAmount(value: number, token: StakeToken) {
  if (token === 'SWIPE') {
    return value >= 1000
      ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : value.toFixed(2);
  }
  return value.toFixed(4);
}

export interface LeaderboardNowProps {
  /**
   * The chain to read. Passed in when this board shares a screen with another
   * one, so both halves cannot end up describing different chains in the same
   * render. Left out, it follows the switcher on its own.
   */
  chainKey?: ChainKey;
}

/**
 * The board itself, as sheet blocks, with no hero and no page wrapper, so it can
 * be dropped into a screen that already has both.
 */
export function LeaderboardNow({ chainKey: chainKeyProp }: LeaderboardNowProps) {
  const active = useActiveChain();
  const chainKey = chainKeyProp ?? active.chainKey;

  // The collateral leg is stored under the key 'USDC' on every chain, so the
  // symbol has to come from the chain rather than from the leg name. Printing
  // the leg name tells a Robinhood user they hold the wrong brand of dollar.
  const stable = tokenSymbol(COLLATERAL_LEG, chainKey);

  const { address } = useAccount();
  const [timeframe, setTimeframe] = useState<Timeframe>('30d');
  const [sortBy, setSortBy] = useState<SortKey>('staked');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Which request the state belongs to. A board for Base that arrives after the
  // user has moved to Robinhood must not be written into state, and neither
  // must an error from a request nobody is waiting for any more.
  const ticketRef = useRef(0);

  useEffect(() => {
    const ticket = ++ticketRef.current;
    const current = () => ticket === ticketRef.current;

    const run = async (silent: boolean) => {
      // A new question deserves a clean slate, and a background refresh does
      // not. The old version raised a loading flag on both, so every sixty
      // seconds the whole board was replaced by the word "Loading" and then put
      // back. There is no flag at all now: rows that do not answer the current
      // question are exactly the state "still waiting", so a second variable
      // saying the same thing could only ever disagree with the first.
      if (!silent) setError(null);
      try {
        const response = await fetch(
          `/api/leaderboard?timeframe=${timeframe}&limit=20&chain=${chainKey}`
        );
        if (!response.ok) throw new Error(`the server answered ${response.status}`);
        const body = await response.json();
        if (!body.success) throw new Error(body.error || 'the board could not be built');
        if (!current()) return;
        setLoaded({ chain: chainKey, timeframe, rows: (body.data ?? []) as LeaderboardRow[] });
        setError(null);
      } catch (err) {
        if (!current()) return;
        // Deliberately does not touch `loaded`. Overwriting good rows with an
        // empty list on a failed fetch is a bug this repo has shipped twice.
        console.error('Failed to load the leaderboard:', err);
        setError(err instanceof Error ? err.message : 'the request failed');
      }
    };

    run(false);
    const timer = setInterval(() => run(true), 60000);
    return () => clearInterval(timer);
    // chainKey, because the URL interpolates it. Without it the board keeps
    // answering for Base after the user has switched away, under the new
    // chain's name. `address` is not a dep: it decides a badge at render time
    // and nothing about the request.
  }, [chainKey, timeframe]);

  // Rows only count as this screen's answer when they answer this screen's
  // question. Anything else is the previous chain's board or the previous
  // window's, and showing it under the new heading would be a lie of framing.
  const rows =
    loaded && loaded.chain === chainKey && loaded.timeframe === timeframe ? loaded.rows : null;

  // Keyed on the addresses themselves, not on the rows. Every sixty second
  // refresh builds a fresh array, and a fresh array identity would send the
  // profile lookup back to the network for the same people every minute.
  const addressKey = (rows ?? []).map((row) => row.address).join(',');
  const addresses = useMemo(() => (addressKey ? addressKey.split(',') : []), [addressKey]);
  const { profiles } = useFarcasterProfiles(addresses);

  const ranked = useMemo(() => {
    const list = [...(rows ?? [])];
    list.sort((a, b) => {
      if (sortBy === 'profit') return b.totalProfit - a.totalProfit;
      if (sortBy === 'bets') return b.totalBets - a.totalBets;
      return b.totalStaked - a.totalStaked;
    });
    // Renumbered from the order actually on screen. The `rank` the route sends
    // is its own profit ranking, so printing it beside a list sorted by stake
    // put a 2 above a 1.
    return list.map((row, index) => ({ ...row, position: index + 1 }));
  }, [rows, sortBy]);

  // Only the collateral leg, and only rows that say they are in it. See
  // boardTotals for why nothing here adds two tokens together.
  const staked = collateralStaked(ranked);
  const settled = ranked.reduce((sum, row) => sum + row.totalBets, 0);
  const opened = ranked.reduce((sum, row) => sum + row.predictionsCreated, 0);
  // Not called `window`. A local of that name shadows the global one for the
  // whole component body, which is a trap waiting for the next person who adds
  // a resize listener here.
  const windowLabel = RANGES.find((r) => r.key === timeframe)?.window ?? 'the window you picked';

  const controls = (
    <div className="lbnow__controls">
      <div className="lbnow__control">
        <span className="lbnow__control-label" id="lbnow-range">Within</span>
        <div className="sheet-segment" role="group" aria-labelledby="lbnow-range">
          {RANGES.map((range) => (
            <button
              key={range.key}
              type="button"
              className="sheet-segment-item"
              aria-pressed={timeframe === range.key}
              onClick={() => setTimeframe(range.key)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lbnow__control">
        <span className="lbnow__control-label" id="lbnow-sort">Order by</span>
        <div className="sheet-segment" role="group" aria-labelledby="lbnow-sort">
          {SORTS.map((sort) => (
            <button
              key={sort.key}
              type="button"
              className="sheet-segment-item"
              aria-pressed={sortBy === sort.key}
              onClick={() => setSortBy(sort.key)}
            >
              {sort.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  let body: React.ReactNode;

  // Absence of rows with no error behind it means the answer is still coming.
  // This is why there is no separate loading flag. An effect runs after the
  // commit, so the render that changes chain or window paints once with the new
  // question, no rows, and any such flag still false, which is exactly the
  // moment a flag-driven branch would put "the request failed" on screen about
  // a request that had not been made.
  if (rows === null && error === null) {
    body = (
      <div className="sheet-empty">
        <strong>Reading the board</strong>
        Working out every position on the live contract.
      </div>
    );
  } else if (rows === null) {
    body = (
      <div className="sheet-empty">
        <strong>Could not read the board</strong>
        The standings did not load, because {error ?? 'the request failed'}. Nothing is
        being shown in their place.
      </div>
    );
  } else if (ranked.length === 0) {
    body = (
      <div className="sheet-empty">
        <strong>Nobody on the board yet</strong>
        No {stable} has been staked on the live contract in {windowLabel}. This board
        fills in from real positions, so it stays empty until somebody bets.
      </div>
    );
  } else {
    body = (
      <div className="lbnow__table">
        <div className="lbnow__head" aria-hidden="true">
          <span>Pos</span>
          <span>Player</span>
          <span>Staked</span>
          <span>Settled</span>
          <span>Profit</span>
        </div>

        {ranked.map((row) => {
          const profile = profiles.find((p) => p && p.address === row.address);
          const hasFarcaster = profile && profile.fid !== null && !profile.isWalletOnly;
          const you = !!address && row.address.toLowerCase() === address.toLowerCase();
          const legs = row.byToken;
          const oldEth = legs?.ETH.invested ?? 0;
          const oldSwipe = legs?.SWIPE.invested ?? 0;

          return (
            <div
              key={row.address}
              className={you ? 'lbnow__row lbnow__row--you' : 'lbnow__row'}
            >
              <div
                className={row.position <= 3 ? 'lbnow__rank lbnow__rank--top' : 'lbnow__rank'}
              >
                {String(row.position).padStart(2, '0')}
              </div>

              <div className="lbnow__who">
                <Avatar
                  className={hasFarcaster ? 'lbnow__avatar' : 'lbnow__avatar lbnow__avatar--wallet'}
                >
                  <AvatarImage
                    src={hasFarcaster ? profile?.pfp_url || undefined : undefined}
                    alt=""
                  />
                  <AvatarFallback>
                    <span className="text-white text-xs font-semibold">
                      {initials(profile, row.address)}
                    </span>
                  </AvatarFallback>
                </Avatar>

                <div className="lbnow__who-text">
                  <div className="lbnow__name">
                    {hasFarcaster ? profile?.display_name || row.displayName : row.displayName}
                    {you && <span className="lbnow__you-badge">You</span>}
                  </div>
                  <div className="lbnow__handle">
                    {hasFarcaster
                      ? `@${profile?.username}`
                      : `${row.address.slice(0, 6)}…${row.address.slice(-4)}`}
                  </div>
                  {(oldEth > 0 || oldSwipe > 0) && (
                    <div className="lbnow__archived">
                      Also on the old contracts
                      {oldEth > 0 ? `, ${archivedAmount(oldEth, 'ETH')} ETH` : ''}
                      {oldSwipe > 0 ? `, ${archivedAmount(oldSwipe, 'SWIPE')} SWIPE` : ''}
                    </div>
                  )}
                </div>
              </div>

              <div className="lbnow__stats">
                <div>
                  <span className="lbnow__stat-label">Staked</span>
                  <span className="lbnow__figure">
                    {row.totalStaked.toFixed(2)}
                    <span className="lbnow__figure-unit">
                      {tokenSymbol(row.totalsToken ?? COLLATERAL_LEG, chainKey)}
                    </span>
                  </span>
                </div>

                <div>
                  <span className="lbnow__stat-label">Settled</span>
                  <span className="lbnow__figure">
                    {row.totalBets}
                    {row.totalBets > 0 && (
                      <span className="lbnow__figure-unit">{row.winRate.toFixed(0)}% won</span>
                    )}
                  </span>
                </div>

                <div>
                  <span className="lbnow__stat-label">Profit</span>
                  {/* A market that has not settled has not produced a profit of
                      zero, it has produced no profit yet. Printing 0.00 in that
                      cell reads as a flat result and it is not one. */}
                  {row.totalBets === 0 ? (
                    <span className="lbnow__figure lbnow__figure--none">not settled</span>
                  ) : (
                    <span
                      className={
                        row.totalProfit < 0
                          ? 'lbnow__figure lbnow__figure--loss'
                          : 'lbnow__figure lbnow__figure--gain'
                      }
                    >
                      {row.totalProfit > 0 ? '+' : ''}
                      {row.totalProfit.toFixed(2)}
                      <span className="lbnow__figure-unit">
                        {tokenSymbol(row.totalsToken ?? COLLATERAL_LEG, chainKey)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <section className="sheet-block">
        <div className="sheet-rail">
          <p className="sheet-eyebrow">Live contract</p>
          <p className="sheet-rail-meta">
            {rows === null
              ? 'Reading'
              : `${ranked.length} ranked\nin ${stable}`}
          </p>
        </div>
        <div>
          {controls}

          {/* An error while rows are on screen is a banner, not a replacement.
              The rows are still the last true answer the server gave. */}
          {error && rows !== null && (
            <p className="lbnow__banner">
              The last refresh failed, because {error}. These standings are from the
              previous successful read.
            </p>
          )}

          {body}
        </div>
      </section>

      {rows !== null && ranked.length > 0 && (
        <section className="sheet-block">
          <div className="sheet-rail">
            <p className="sheet-eyebrow">In this window</p>
            <p className="sheet-rail-meta">{`Live contract\nonly`}</p>
          </div>
          <div>
            <div className="sheet-board">
              <div className="sheet-settle">
                <div className="sheet-settle-row">
                  <span className="sheet-settle-key">People on the board</span>
                  <span className="sheet-settle-val">{ranked.length}</span>
                </div>
                <div className="sheet-settle-row">
                  <span className="sheet-settle-key">Markets opened by them</span>
                  <span className="sheet-settle-val">{opened}</span>
                </div>
                <div className="sheet-settle-row">
                  <span className="sheet-settle-key">Bets that have settled</span>
                  <span className="sheet-settle-val">
                    {settled === 0 ? 'none yet' : settled}
                  </span>
                </div>
                <div className="sheet-settle-row sheet-settle-row--total">
                  <span className="sheet-settle-key">Staked in {stable}</span>
                  <span className="sheet-settle-val">
                    {staked.toFixed(2)} {stable}
                  </span>
                </div>
              </div>
            </div>

            <div className="sheet-note">
              <p>
                Profit is what the parimutuel split paid, so it only exists once a market
                has settled. Until then a row shows what is at stake and nothing more.
                Positions on the old ETH and SWIPE contracts appear under a player&apos;s
                name, kept out of the {stable} figures, because one raw ETH and one raw
                {' '}{stable} are numbers of a different size and adding them would put dust
                at the top of the board.
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/**
 * The same board as a screen of its own, for anywhere it is not being composed
 * into a page that already brings a hero.
 */
export function Leaderboard() {
  return (
    <div className="sheet">
      <div className="sheet-shell">
        <header className="sheet-hero">
          <div className="sheet-hero-top">
            <div>
              <p className="sheet-eyebrow">Leaderboard</p>
              <h1 className="sheet-hero-title">
                Who is <em>up</em> right now
              </h1>
            </div>
          </div>
          <p className="sheet-hero-lede">
            Everyone holding a position on the contract that is currently taking bets,
            ranked on what they have staked. Profit appears once a market settles.
          </p>
        </header>
        <main className="sheet-body">
          <LeaderboardNow />
        </main>
      </div>
    </div>
  );
}

export default Leaderboard;
