"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useOpenUrl } from '@coinbase/onchainkit/minikit';
import sdk from '@farcaster/miniapp-sdk';
import './Manifesto.css';

const V3_ADDRESS = '0x5C4078BB24f352809B93FF395cA7655835D1CA4a';

/**
 * One worked settlement, carried through the whole page.
 *
 * Every figure here is the real V3 arithmetic at the rates deployed on Base:
 * fees come out of the losing pool only, 3% platform and 0.5% creator, and the
 * winning side splits the remainder by weighted stake. The two winners staked at
 * different points in the market's life, which is the only reason their returns
 * differ, and the difference is stated in the copy rather than glossed.
 *
 *   losing pool                     1000.00
 *   platform 3%                      -30.00
 *   creator 0.5%                      -5.00
 *   to the yes side                  965.00
 *
 *   Alice  100.00 at x1.50  ->  weighted 150  ->  150/450 of 965 = 321.67
 *   Ben    300.00 at x1.00  ->  weighted 300  ->  300/450 of 965 = 643.33
 *
 * Unweighted, the same two would have taken 241.25 and 723.75. So the weighting
 * moved 80.42 from Ben to Alice and grew nothing. That number is in the copy on
 * purpose: it is the honest version of the early-entry bonus.
 */
const EXAMPLE = {
  question: 'Will ETH close above $4,000 on 31 Dec?',
  yesPool: 400,
  noPool: 1000,
  platformFee: 30,
  creatorFee: 5,
  netToWinners: 965,
  redistributed: 80.42,
};

const usd = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ManifestoPage() {
  const minikitOpenUrl = useOpenUrl();
  const [boardReady, setBoardReady] = useState(false);

  // Bars grow once, on mount. Reduced motion is handled in CSS, which drops the
  // transition so the same end state arrives immediately.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setBoardReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Works on both MiniKit (Base app) and the Farcaster SDK (Warpcast).
  const openUrl = useCallback((url: string) => {
    try {
      if (minikitOpenUrl) {
        minikitOpenUrl(url);
        return;
      }
    } catch {
      // Fall through to the Farcaster SDK.
    }
    try {
      sdk.actions.openUrl(url);
    } catch (error) {
      console.error('openUrl failed on both transports:', error);
    }
  }, [minikitOpenUrl]);

  const larger = Math.max(EXAMPLE.yesPool, EXAMPLE.noPool);

  return (
    <div className="mf">
      <div className="mf-shell">

        <header className="mf-hero">
          <div className="mf-hero-top">
            <div>
              <p className="mf-eyebrow">Swipe manifesto</p>
              <h1 className="mf-hero-title">
                Winners take from losers. The house takes <em>no side</em>.
              </h1>
            </div>

            <div className="mf-social">
              <button
                type="button"
                className="mf-social-link"
                aria-label="Swipe on X"
                onClick={() => openUrl('https://x.com/swipe_ai_')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </button>
              <button
                type="button"
                className="mf-social-link"
                aria-label="Swipe on Discord"
                onClick={() => openUrl('https://discord.gg/nw9TzCwUhx')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </button>
              <button
                type="button"
                className="mf-social-link"
                aria-label="Swipe on Telegram"
                onClick={() => openUrl('https://t.me/SWIPEONBASE')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.01-.033.02-.149-.056-.22s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              </button>
            </div>
          </div>

          <p className="mf-hero-lede">
            Swipe is a parimutuel prediction market. You back yes or no on a
            question with USDC, and at the deadline the winning side splits what
            the losing side staked. No order book, no market maker, and none of
            our own money in the pot. We take a cut of the losing pool and
            nothing else.
          </p>

          {/* The signature: one settlement, drawn the way a tote board draws it. */}
          <section
            className={`mf-board${boardReady ? ' mf-board--ready' : ''}`}
            aria-label="Worked example of a settlement"
          >
            <div className="mf-board-head">
              <h2 className="mf-board-q">{EXAMPLE.question}</h2>
              <p className="mf-board-outcome">Settled yes</p>
            </div>

            <div className="mf-pools">
              <div className="mf-pool mf-pool--yes">
                <div className="mf-pool-top">
                  <span className="mf-pool-side">Yes</span>
                  <span className="mf-pool-figure">{usd(EXAMPLE.yesPool)}</span>
                </div>
                <div className="mf-pool-track">
                  <div
                    className="mf-pool-fill"
                    style={{ ['--mf-fill' as string]: EXAMPLE.yesPool / larger }}
                  />
                </div>
                <p className="mf-pool-note">Two backers. Called it right.</p>
              </div>

              <div className="mf-pool mf-pool--no">
                <div className="mf-pool-top">
                  <span className="mf-pool-side">No</span>
                  <span className="mf-pool-figure">{usd(EXAMPLE.noPool)}</span>
                </div>
                <div className="mf-pool-track">
                  <div
                    className="mf-pool-fill"
                    style={{ ['--mf-fill' as string]: EXAMPLE.noPool / larger }}
                  />
                </div>
                <p className="mf-pool-note">This is the pool that gets split.</p>
              </div>
            </div>

            <div className="mf-settle">
              <div className="mf-settle-row">
                <span className="mf-settle-key">Losing pool</span>
                <span className="mf-settle-val">{usd(EXAMPLE.noPool)}</span>
              </div>
              <div className="mf-settle-row">
                <span className="mf-settle-key">Platform fee, 3%</span>
                <span className="mf-settle-val">−{usd(EXAMPLE.platformFee)}</span>
              </div>
              <div className="mf-settle-row">
                <span className="mf-settle-key">Creator fee, 0.5%</span>
                <span className="mf-settle-val">−{usd(EXAMPLE.creatorFee)}</span>
              </div>
              <div className="mf-settle-row mf-settle-row--total">
                <span className="mf-settle-key">Split between the yes side</span>
                <span className="mf-settle-val">{usd(EXAMPLE.netToWinners)}</span>
              </div>
              <div className="mf-settle-row">
                <span className="mf-settle-key">Alice staked 100.00, in at ×1.50</span>
                <span className="mf-settle-val">
                  421.67
                  <span className="mf-settle-sub">+321.67 on 100</span>
                </span>
              </div>
              <div className="mf-settle-row">
                <span className="mf-settle-key">Ben staked 300.00, in at ×1.00</span>
                <span className="mf-settle-val">
                  943.33
                  <span className="mf-settle-sub">+643.33 on 300</span>
                </span>
              </div>
            </div>

            <div className="mf-weights">
              <div className="mf-weights-head">
                <p className="mf-eyebrow">Weight is fixed the moment you bet</p>
                <span className="mf-weights-span">Quarters of the market&apos;s own life</span>
              </div>
              <div className="mf-quarters">
                <div className="mf-quarter mf-quarter--x150">
                  <span className="mf-quarter-w">×1.50</span>
                  <span className="mf-quarter-when">First quarter</span>
                </div>
                <div className="mf-quarter mf-quarter--x125">
                  <span className="mf-quarter-w">×1.25</span>
                  <span className="mf-quarter-when">Second quarter</span>
                </div>
                <div className="mf-quarter">
                  <span className="mf-quarter-w">×1.00</span>
                  <span className="mf-quarter-when">Third quarter</span>
                </div>
                <div className="mf-quarter">
                  <span className="mf-quarter-w">×1.00</span>
                  <span className="mf-quarter-when">Last quarter, exit rule applies</span>
                </div>
              </div>
            </div>
          </section>
        </header>

        <main className="mf-body">

          <section className="mf-block">
            <div className="mf-rail">
              <p className="mf-eyebrow">The model</p>
              <p className="mf-rail-meta">Parimutuel</p>
            </div>
            <div className="mf-prose">
              <h2 className="mf-h2">You are betting against the other players</h2>
              <p className="mf-p">
                Everyone who backs a side puts their stake into that side&apos;s
                pool. At the deadline the market resolves and the winning pool
                splits the losing one. That is the whole mechanism. The platform
                holds no position, so it cannot win or lose on an outcome, and
                there is nothing for it to trade against you.
              </p>
              <p className="mf-p">
                An order book or an AMM was the obvious alternative and we turned
                it down. Both need the platform to put its own capital into every
                market to quote a price. That capital has a side, and a house with
                a side eventually behaves like one.
              </p>
            </div>
          </section>

          <section className="mf-block">
            <div className="mf-rail">
              <p className="mf-eyebrow">Payouts</p>
              <p className="mf-rail-meta">3% + 0.5%<br />losing pool only</p>
            </div>
            <div className="mf-prose">
              <h2 className="mf-h2">A correct prediction never returns less than it cost</h2>
              <p className="mf-p">
                Fees come out of the losing pool and nowhere else. A winner gets
                their full stake back, plus a share of what the losers staked,
                minus the fees. There is no market condition where you read the
                outcome correctly and end up down.
              </p>
              <p className="mf-p">
                The platform takes <span className="mf-data">3%</span> of the
                losing pool and the market&apos;s creator takes{' '}
                <span className="mf-data">0.5%</span>. A winner keeps 97% of their
                winnings, against 5% of winnings at Betfair and a takeout of 15 to
                20 per cent at a traditional tote.
              </p>
              <p className="mf-p">
                A fee on total volume instead of on winnings was considered and
                rejected. On a lopsided market it eats most of the payout, and it
                would break the promise in the heading, which is worth more than
                the revenue.
              </p>
            </div>
          </section>

          <section className="mf-block">
            <div className="mf-rail">
              <p className="mf-eyebrow">Timing</p>
              <p className="mf-rail-meta">×1.50 / ×1.25 / ×1.00</p>
            </div>
            <div className="mf-prose">
              <h2 className="mf-h2">Backing a question early is worth more</h2>
              <p className="mf-p">
                Taking a view before the answer is obvious is the whole point of a
                prediction market, and paying the same for it either way makes no
                sense. So a bet carries a weight, fixed at the moment it is placed
                by which quarter of the market&apos;s life it lands in, and that
                weight decides how the losing pool is divided.
              </p>
              <p className="mf-p">
                <strong>This moves money between players and creates none.</strong>{' '}
                In the settlement above, weighting moved{' '}
                <span className="mf-data">{usd(EXAMPLE.redistributed)}</span> from
                Ben to Alice. The losing pool was{' '}
                <span className="mf-data">{usd(EXAMPLE.noPool)}</span> before the
                weights were applied and{' '}
                <span className="mf-data">{usd(EXAMPLE.noPool)}</span> after. Early
                backers take a larger share of the same pool and late backers take
                a smaller one. Anyone describing it as everyone earning more is
                selling you something.
              </p>
              <p className="mf-p">
                Your stake itself is never weighted. It comes back raw, and every
                refund returns exactly what you put in.
              </p>
            </div>
          </section>

          <section className="mf-block">
            <div className="mf-rail">
              <p className="mf-eyebrow">Placing a bet</p>
              <p className="mf-rail-meta">Floor 0.1 USDC</p>
            </div>
            <div className="mf-prose">
              <h2 className="mf-h2">What happens when you back a side</h2>
              <ol className="mf-steps">
                <li className="mf-step">
                  <p className="mf-step-text">
                    You approve USDC for the market contract. Once, not per bet.
                  </p>
                </li>
                <li className="mf-step">
                  <p className="mf-step-text">
                    You pick a side and an amount. The minimum is{' '}
                    <strong>0.1 USDC</strong>, which is the contract&apos;s own
                    floor rather than a policy.
                  </p>
                </li>
                <li className="mf-step">
                  <p className="mf-step-text">
                    Your weight is set from the clock at that moment and{' '}
                    <strong>never recalculated</strong>, on a read, a settlement or
                    a claim.
                  </p>
                </li>
                <li className="mf-step">
                  <p className="mf-step-text">
                    At the deadline a resolver settles the outcome. Nothing can be
                    settled while betting is still open.
                  </p>
                </li>
                <li className="mf-step">
                  <p className="mf-step-text">
                    You claim. Winnings are pulled by you, they are not pushed at
                    you, and nothing expires.
                  </p>
                </li>
              </ol>
            </div>
          </section>

          <section className="mf-block">
            <div className="mf-rail">
              <p className="mf-eyebrow">Guarantees</p>
              <p className="mf-rail-meta">Audited<br />8 findings closed</p>
            </div>
            <div className="mf-prose">
              <h2 className="mf-h2">What the contract will not let anyone do</h2>
              <p className="mf-p">
                Each of these is a fix for something the previous contract got
                wrong, and each one is enforced in code rather than promised here.
              </p>
              <div className="mf-rules">
                <div className="mf-rule-row">
                  <p className="mf-rule-term">Keep the pool when nobody backed the winner</p>
                  <p className="mf-rule-def">
                    Everyone is refunded instead. The old contract handed the whole
                    pool to the platform, which paid a dishonest resolver for
                    picking the empty side.
                  </p>
                </div>
                <div className="mf-rule-row">
                  <p className="mf-rule-term">Settle before the deadline</p>
                  <p className="mf-rule-def">
                    Refused outright. The old contract let a resolver call the
                    outcome while bets were still being taken.
                  </p>
                </div>
                <div className="mf-rule-row">
                  <p className="mf-rule-term">Sit on a market and never resolve it</p>
                  <p className="mf-rule-def">
                    Thirty days after a missed deadline, anyone at all can open
                    refunds. Your stake never depends on one key staying
                    available.
                  </p>
                </div>
                <div className="mf-rule-row">
                  <p className="mf-rule-term">Lose one key and take the markets with it</p>
                  <p className="mf-rule-def">
                    Ownership transfers in two steps, and settling is a separate,
                    revocable role. Automation runs on a narrow hot key while
                    ownership stays cold.
                  </p>
                </div>
                <div className="mf-rule-row">
                  <p className="mf-rule-term">Freeze a market by refusing a payment</p>
                  <p className="mf-rule-def">
                    Creator rewards are pulled, not pushed. A creator who could
                    not receive the token used to be able to block settlement for
                    everyone else in that market.
                  </p>
                </div>
                <div className="mf-rule-row">
                  <p className="mf-rule-term">Empty a side to turn a loss into a refund</p>
                  <p className="mf-rule-def">
                    In the last quarter of a market&apos;s life, an exit cannot
                    take a side&apos;s pool to zero. Before that quarter you can
                    always exit in full, even as the only backer of your side.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mf-block">
            <div className="mf-rail">
              <p className="mf-eyebrow">Exiting</p>
              <p className="mf-rail-meta">5% of exit value</p>
            </div>
            <div className="mf-prose">
              <h2 className="mf-h2">You can sell out before the deadline</h2>
              <p className="mf-p">
                Part of a position or all of it, for{' '}
                <span className="mf-data">5%</span> of what the exit is worth. The
                price comes off the two pools as they stand at that moment, so
                walking away from a side that is winning returns close to your
                stake, and walking away from a side that is losing returns little.
                That is the market pricing your change of mind, not a penalty.
              </p>
              <p className="mf-p">
                One restriction, and only in the final quarter: your exit cannot
                leave your side with nothing in it. An empty winning side turns
                settlement into a refund for everybody, including the people who
                had already lost, which is a door worth closing once the outcome
                is usually knowable.
              </p>
            </div>
          </section>

          <section className="mf-block">
            <div className="mf-rail">
              <p className="mf-eyebrow">Where it runs</p>
              <p className="mf-rail-meta">One deployment per chain</p>
            </div>
            <div className="mf-prose">
              <h2 className="mf-h2">Base now, Robinhood next</h2>
              <div className="mf-chains">
                <div className="mf-chain">
                  <span className="mf-chain-name">Base</span>
                  <span className="mf-chain-token">USDC</span>
                  <span className="mf-chain-where">
                    <a
                      href={`https://basescan.org/address/${V3_ADDRESS}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {V3_ADDRESS}
                    </a>
                  </span>
                </div>
                <div className="mf-chain mf-chain--pending">
                  <span className="mf-chain-name">Robinhood</span>
                  <span className="mf-chain-token">USDG</span>
                  <span className="mf-chain-where">Not deployed yet</span>
                </div>
              </div>
              <p className="mf-p" style={{ marginTop: 20 }}>
                A contract lives at one address on one chain, so each chain runs
                its own deployment of the same audited source, holding its own
                collateral. The token is fixed when the contract is deployed and
                can never be changed afterwards. Markets belong to their chain and
                the pools are never shared.
              </p>
            </div>
          </section>

          <section className="mf-block">
            <div className="mf-rail">
              <p className="mf-eyebrow">State of play</p>
              <p className="mf-rail-meta">Read this one</p>
            </div>
            <div className="mf-prose">
              <h2 className="mf-h2">What is true today</h2>
              <div className="mf-note">
                <p>
                  The contract above is deployed and verified on Base. The app is
                  still being moved onto it, so betting in the interface is
                  switched off rather than quietly pointed at the old contracts.
                  We would rather refuse a bet than take one we cannot settle.
                </p>
                <p>
                  Markets created before this contract are archived. They take no
                  new bets, and your past positions and results stay visible where
                  they always were.
                </p>
              </div>
            </div>
          </section>

        </main>

        <footer className="mf-footer">
          <p className="mf-footer-note">
            Parimutuel prediction markets on Base · contracts under BUSL-1.1
          </p>
          <div className="mf-footer-links">
            <button
              type="button"
              className="mf-footer-link"
              onClick={() => openUrl(window.location.origin + '/')}
            >
              Back to Swipe
            </button>
            <button
              type="button"
              className="mf-footer-link"
              onClick={() => openUrl(window.location.origin + '/help')}
            >
              Help &amp; FAQ
            </button>
          </div>
        </footer>

      </div>
    </div>
  );
}
