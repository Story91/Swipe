'use client';

import React, { useState } from 'react';
import { useActiveChain } from '@/lib/chains/activeChain';
import './DailyTasks.css';

/**
 * Daily tasks, rebuilt as a preview instead of a payout screen.
 *
 * What was here before read four functions off SwipeDailyRewards V3 with a
 * fallback to V2, plus a fifth off V1 to offer a migration, plus the $SWIPE
 * balance on Base. All of those contracts are archived and their owner key is
 * gone, so every number the old screen printed was either stale or zero and
 * every button on it opened a transaction that could not pay. The worst of it
 * was not the dead buttons, it was the figures: a streak, a "today's reward" of
 * 50,000, a 5% jackpot chance, a claimed total. A user reads those as theirs.
 *
 * So this file makes no network call and no contract read at all. It renders
 * the shape of the flow, says once that the shape is all it is, and shows no
 * quantity that could be mistaken for a balance, a streak or a promised reward.
 *
 * The numbers that do appear are the market contract's own rules, which are
 * live today and have nothing to do with the rewards contracts: the minimum
 * bet, the early-bet weighting, the creator fee and the early exit fee. The
 * collateral symbol comes from the selected chain rather than a literal,
 * because the minimum is 0.1 USDC on Base and 0.1 USDG on Robinhood.
 *
 * The one working control is the example toggle. A page of greyed-out rows
 * shows the layout but not the behaviour, and the behaviour is the part being
 * previewed. Turning it on fills the rows in and arms the claim buttons without
 * enabling them, and the note next to it says whose day it is not.
 */

interface TaskRow {
  id: string;
  name: string;
  description: string;
}

/**
 * The four things a day is likely to ask for. Written as actions in the market,
 * not as a points scheme, because the rates behind a points scheme do not exist
 * and inventing them here is what this rewrite is undoing.
 */
function taskRows(symbol: string): TaskRow[] {
  return [
    {
      id: 'bet',
      name: 'Place a bet',
      description:
        `Back yes or no on any open market. The minimum is 0.1 ${symbol}. A bet placed early ` +
        "counts for more when the pool is split, 1.50 in the first quarter of a market's " +
        'life, 1.25 in the second, then 1.00 for the whole second half.',
    },
    {
      id: 'open',
      name: 'Open a market',
      description:
        'Write a question with a deadline and something that decides it. The contract already ' +
        'pays whoever opened a market 0.5% of the losing side.',
    },
    {
      id: 'hold',
      name: 'Hold a position to settlement',
      description:
        'Leave a stake in until the market resolves. Taking the early exit instead costs 5% of it.',
    },
    {
      id: 'invite',
      name: 'Bring someone in',
      description: 'Someone joins through your link and places a bet of their own.',
    },
  ];
}

export function DailyTasks() {
  const { chain } = useActiveChain();
  const [showExample, setShowExample] = useState(false);

  const rows = taskRows(chain.stable.symbol);

  return (
    <div className="daily-tasks">
      <header className="daily-tasks__head">
        <h2 className="daily-tasks__title">Daily tasks</h2>
        <span className="daily-tasks__tag">preview</span>
      </header>

      <section className="daily-tasks__notice">
        <p className="daily-tasks__line">
          Nothing here works yet. This is a mock-up of how daily tasks are meant to run,
          so you can see the shape of it before it is built.
        </p>
        <p className="daily-tasks__line">
          A new Swipe token is planned on Robinhood Chain. There is no date for it, and no
          reward amounts have been decided, so no task below shows one.
        </p>
      </section>

      <div className="daily-tasks__demo">
        <button
          type="button"
          className="daily-tasks__demo-btn"
          aria-pressed={showExample}
          onClick={() => setShowExample((on) => !on)}
        >
          {showExample ? 'Clear the example' : 'Show an example day'}
        </button>
        <p className="daily-tasks__demo-note">
          {showExample
            ? 'The rows below are filled in as an example of a finished day. None of it is your activity, and nothing became claimable.'
            : 'This is the only control on the page that does anything. It fills the rows in so you can see what a finished day would look like.'}
        </p>
      </div>

      <section className="daily-tasks__tasks">
        <h3 className="daily-tasks__section-title">What a day would ask of you</h3>
        <p className="daily-tasks__section-note">
          Every button from here down is switched off. They mark where the flow goes.
          Pressing one does nothing.
        </p>

        <ul className="daily-tasks__list">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`daily-tasks__row${showExample ? ' daily-tasks__row--done' : ''}`}
            >
              <div className="daily-tasks__row-main">
                <span className="daily-tasks__row-name">{row.name}</span>
                <span className="daily-tasks__row-desc">{row.description}</span>

                {/* Decorative. The state word underneath carries the same
                    information in text, so the bar has nothing to announce. */}
                <span className="daily-tasks__track" aria-hidden="true">
                  <span
                    className={`daily-tasks__fill${showExample ? ' daily-tasks__fill--full' : ''}`}
                  />
                </span>

                <span className="daily-tasks__state">
                  {showExample ? 'done in the example' : 'not tracked'}
                </span>
              </div>

              <div className="daily-tasks__row-side">
                <span className="daily-tasks__reward">reward not set</span>
                <button
                  type="button"
                  className={`daily-tasks__row-claim${showExample ? ' daily-tasks__row-claim--armed' : ''}`}
                  disabled
                >
                  Claim
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="daily-tasks__claim">
        <span className="daily-tasks__claim-label">End of day</span>
        <button
          type="button"
          className={`daily-tasks__claim-btn${showExample ? ' daily-tasks__claim-btn--armed' : ''}`}
          disabled
        >
          Claim the day
        </button>
        <p className="daily-tasks__claim-note">
          In the finished version this collects the day in one transaction. There is no
          balance on this page because there is no token yet to hold one in.
        </p>
      </section>

      <section className="daily-tasks__past">
        <h3 className="daily-tasks__section-title">Why the old one stopped</h3>
        <p className="daily-tasks__line">
          Daily claims used to pay in the $SWIPE token on Base, through three versions of a
          rewards contract. All three are archived and the key that owned them is gone, so
          they cannot pay anyone. The streaks they recorded are still on chain and still
          readable. They cannot turn into money.
        </p>
        <p className="daily-tasks__line">
          Betting is unaffected. Bets settle in the stablecoin of whichever chain you are
          on, USDC on Base and Paxos USDG on Robinhood Chain, through the market contract,
          and none of that runs through this page.
        </p>
      </section>
    </div>
  );
}

export default DailyTasks;
