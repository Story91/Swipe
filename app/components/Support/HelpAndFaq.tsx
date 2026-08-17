"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useOpenUrl } from '@coinbase/onchainkit/minikit';
import sdk from '@farcaster/miniapp-sdk';
import './HelpAndFaq.css';

/**
 * Help & FAQ, set as the back page of the manifesto's racecard.
 *
 * The worked example carries the same figures the manifesto uses, drawn on the
 * same tote board, because they are the same settlement. Anything factual here
 * comes from docs/v3/rules-v3.md and the rates deployed on Base; see the
 * manifesto's own note for the arithmetic.
 *
 * Rendered in two places: as the help-faq dashboard panel in app/page.tsx, and
 * as the standalone /help route the manifesto's footer links to.
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

interface FAQItem {
  id: number;
  question: string;
  answer: string;
}

interface FAQGroup {
  label: string;
  meta: string;
  heading: string;
  items: FAQItem[];
}

const FAQ_GROUPS: FAQGroup[] = [
  {
    label: 'The basics',
    meta: 'Parimutuel\nUSDC on Base',
    heading: 'What Swipe is, and where it runs',
    items: [
      {
        id: 1,
        question: 'What is a prediction market?',
        answer:
          "Swipe is a parimutuel prediction market: you back YES or NO on a question with USDC, and at the deadline the winning side splits what the losing side staked. There's no order book and no market maker. The platform holds no position of its own, so it cannot win or lose on the outcome, only take a fee.",
      },
      {
        id: 2,
        question: 'Which networks does Swipe run on?',
        answer:
          "Base today, collateralised in USDC. Robinhood Chain is next, in USDG, but V3 isn't deployed there yet. Each chain runs its own instance of the same audited contract, at its own address, and markets don't share liquidity across chains.",
      },
    ],
  },
  {
    label: 'Betting',
    meta: 'Floor 0.1 USDC\nexit fee 5%',
    heading: 'Backing a side, and changing your mind',
    items: [
      {
        id: 3,
        question: 'How do I place a bet?',
        answer:
          "Betting is temporarily paused while the app finishes moving onto the new V3 contract, which is live and verified on Base. We'd rather refuse a bet than take one on a contract we can't guarantee settlement for. Once it reopens: approve USDC once, pick a side and an amount (0.1 USDC minimum), and confirm.",
      },
      {
        id: 4,
        question: 'Can I exit a bet before the deadline?',
        answer:
          'Yes, part of a position or all of it, for a 5% fee on what the exit is worth. The price comes off the two pools as they stand at that moment, so leaving a side that is winning returns close to your stake and leaving a losing side returns little. One restriction: in a market’s final quarter you cannot exit a side down to exactly zero if you are the only one backing it.',
      },
      {
        id: 5,
        question: 'How does the swipe interface work?',
        answer:
          'Swipe right for YES or left for NO to place a quick bet from the card stack. The swipe path is being rebuilt for the new contract along with the rest of betting, so for now the cards are for reading markets rather than betting on them.',
      },
    ],
  },
  {
    label: 'Payouts',
    meta: '3% + 0.5%\nlosing pool only',
    heading: 'What you get back, and when',
    items: [
      {
        id: 6,
        question: 'How are payouts calculated?',
        answer:
          'Winners split what the losing side staked, after a 3% platform fee and a 0.5% creator fee, both taken only from the losing pool. Your own stake always comes back in full. How much of the split you get depends on your stake and when you placed it: bets in a market’s first quarter count for ×1.50 when the losing pool is divided, ×1.25 in the second quarter, ×1.00 after.',
      },
      {
        id: 7,
        question: 'How long does it take to resolve a prediction?',
        answer:
          'A resolver settles the market once its deadline passes; nothing can be resolved while betting is still open. If a market sits unresolved 30 days past its deadline, anyone at all can open refunds for it, so your stake is never stuck waiting on a single key.',
      },
      {
        id: 8,
        question: 'How do I claim my winnings?',
        answer:
          'Open the resolved market from your dashboard and claim. Payouts are pulled by you rather than sent automatically, and nothing expires. If a market becomes refundable instead, you claim your stake back the same way.',
      },
    ],
  },
  {
    label: 'Getting set up',
    meta: 'Wallet\nand markets',
    heading: 'Wallets, and where markets come from',
    items: [
      {
        id: 9,
        question: 'How do I connect my wallet?',
        answer:
          'Use the Sign In button in the top bar and pick your wallet. Inside the Base app or a Farcaster client you are usually connected already, and Swipe will use that session rather than asking again.',
      },
      {
        id: 10,
        question: 'How do I create a prediction?',
        answer:
          "Markets are added by the Swipe team rather than through a self-serve form right now. Only a resolver can register a market on the contract, which is also what keeps the number of open markets small enough for each one to have real liquidity. Self-serve creation is part of what's still being rebuilt for V3.",
      },
    ],
  },
];

export function HelpAndFaq() {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [boardReady, setBoardReady] = useState(false);
  const minikitOpenUrl = useOpenUrl();

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

  const toggleExpanded = (id: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const larger = Math.max(EXAMPLE.yesPool, EXAMPLE.noPool);

  return (
    <div className="hf">
      <div className="hf-shell">

        <header className="hf-hero">
          <div className="hf-hero-top">
            <div>
              <p className="hf-eyebrow">Help &amp; FAQ</p>
              <h1 className="hf-hero-title">
                How a market <em>pays out</em>
              </h1>
            </div>

            <div className="hf-social">
              <button
                type="button"
                className="hf-social-link"
                aria-label="Swipe on X"
                onClick={() => openUrl('https://x.com/swipe_ai_')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </button>
              <button
                type="button"
                className="hf-social-link"
                aria-label="Swipe on Discord"
                onClick={() => openUrl('https://discord.gg/nw9TzCwUhx')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </button>
              <button
                type="button"
                className="hf-social-link"
                aria-label="Swipe on Telegram"
                onClick={() => openUrl('https://t.me/SWIPEONBASE')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.01-.033.02-.149-.056-.22s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              </button>
            </div>
          </div>

          <p className="hf-hero-lede">
            Everything below is how the deployed contract actually behaves, not a
            simplified version of it. If something here disagrees with what the
            app does, the contract is right and this page is wrong. Tell us.
          </p>
        </header>

        <main className="hf-body">

          {/* The example first: most questions below are easier to answer once a
              reader has seen one settlement all the way through. */}
          <section className="hf-block">
            <div className="hf-rail">
              <p className="hf-eyebrow">One settlement</p>
              <p className="hf-rail-meta">Worked end to end</p>
            </div>
            <div className="hf-prose">
              <h2 className="hf-h2">A market, from stake to payout</h2>
              <p className="hf-p">
                Two people back yes, one pool backs no, and no wins nothing. The
                figures are the real arithmetic at the rates deployed on Base.
              </p>

              <section
                className={`hf-board${boardReady ? ' hf-board--ready' : ''}`}
                aria-label="Worked example of a settlement"
              >
                <div className="hf-board-head">
                  <h3 className="hf-board-q">{EXAMPLE.question}</h3>
                  <p className="hf-board-outcome">Settled yes</p>
                </div>

                <div className="hf-pools">
                  <div className="hf-pool hf-pool--yes">
                    <div className="hf-pool-top">
                      <span className="hf-pool-side">Yes</span>
                      <span className="hf-pool-figure">{usd(EXAMPLE.yesPool)}</span>
                    </div>
                    <div className="hf-pool-track">
                      <div
                        className="hf-pool-fill"
                        style={{ ['--hf-fill' as string]: EXAMPLE.yesPool / larger }}
                      />
                    </div>
                    <p className="hf-pool-note">Two backers. Called it right.</p>
                  </div>

                  <div className="hf-pool hf-pool--no">
                    <div className="hf-pool-top">
                      <span className="hf-pool-side">No</span>
                      <span className="hf-pool-figure">{usd(EXAMPLE.noPool)}</span>
                    </div>
                    <div className="hf-pool-track">
                      <div
                        className="hf-pool-fill"
                        style={{ ['--hf-fill' as string]: EXAMPLE.noPool / larger }}
                      />
                    </div>
                    <p className="hf-pool-note">This is the pool that gets split.</p>
                  </div>
                </div>

                <div className="hf-backers">
                  <div className="hf-backer hf-backer--early">
                    <span className="hf-backer-who">Alice staked 100.00, first quarter</span>
                    <span className="hf-backer-w">×1.50 → weighted 150</span>
                  </div>
                  <div className="hf-backer">
                    <span className="hf-backer-who">Ben staked 300.00, second half</span>
                    <span className="hf-backer-w">×1.00 → weighted 300</span>
                  </div>
                </div>

                <div className="hf-settle">
                  <div className="hf-settle-row">
                    <span className="hf-settle-key">Losing pool</span>
                    <span className="hf-settle-val">{usd(EXAMPLE.noPool)}</span>
                  </div>
                  <div className="hf-settle-row">
                    <span className="hf-settle-key">Platform fee, 3%</span>
                    <span className="hf-settle-val">−{usd(EXAMPLE.platformFee)}</span>
                  </div>
                  <div className="hf-settle-row">
                    <span className="hf-settle-key">Creator fee, 0.5%</span>
                    <span className="hf-settle-val">−{usd(EXAMPLE.creatorFee)}</span>
                  </div>
                  <div className="hf-settle-row hf-settle-row--total">
                    <span className="hf-settle-key">Split between the yes side</span>
                    <span className="hf-settle-val">{usd(EXAMPLE.netToWinners)}</span>
                  </div>
                  <div className="hf-settle-row">
                    <span className="hf-settle-key">Alice takes 150 of 450 weighted</span>
                    <span className="hf-settle-val">
                      421.67
                      <span className="hf-settle-sub">+321.67 on 100</span>
                    </span>
                  </div>
                  <div className="hf-settle-row">
                    <span className="hf-settle-key">Ben takes 300 of 450 weighted</span>
                    <span className="hf-settle-val">
                      943.33
                      <span className="hf-settle-sub">+643.33 on 300</span>
                    </span>
                  </div>
                </div>
              </section>

              <div className="hf-note">
                <p>
                  <strong>Betting early moves money between winners, it does not
                  create any.</strong> Here the weighting moved{' '}
                  <span className="hf-data">{usd(EXAMPLE.redistributed)}</span> from
                  Ben to Alice. The losing pool was{' '}
                  <span className="hf-data">{usd(EXAMPLE.noPool)}</span> before the
                  weights and the same after.
                </p>
                <p>
                  Bet on the losing side and you lose your whole stake. That is the
                  other half of the same mechanism, and no fee schedule softens it.
                </p>
              </div>
            </div>
          </section>

          {FAQ_GROUPS.map(group => (
            <section className="hf-block" key={group.label}>
              <div className="hf-rail">
                <p className="hf-eyebrow">{group.label}</p>
                <p className="hf-rail-meta" style={{ whiteSpace: 'pre-line' }}>{group.meta}</p>
              </div>
              <div className="hf-prose">
                <h2 className="hf-h2">{group.heading}</h2>
                <div className="hf-faq">
                  {group.items.map(faq => {
                    const open = expandedItems.has(faq.id);
                    return (
                      <div
                        className={`hf-faq-item${open ? ' hf-faq-item--open' : ''}`}
                        key={faq.id}
                      >
                        <button
                          type="button"
                          className="hf-faq-q"
                          aria-expanded={open}
                          aria-controls={`hf-answer-${faq.id}`}
                          onClick={() => toggleExpanded(faq.id)}
                        >
                          <span>{faq.question}</span>
                          <span className="hf-faq-mark" aria-hidden="true" />
                        </button>
                        {open && (
                          <p className="hf-faq-a" id={`hf-answer-${faq.id}`}>
                            {faq.answer}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}

          <section className="hf-block">
            <div className="hf-rail">
              <p className="hf-eyebrow">Still stuck</p>
              <p className="hf-rail-meta">We read all of it</p>
            </div>
            <div className="hf-prose">
              <h2 className="hf-h2">Ask, or tell us what broke</h2>
              <p className="hf-p">
                A question this page does not answer is a gap in this page. Bugs
                and feature requests go to the same places, and both get read.
              </p>
              <div className="hf-support">
                <button
                  type="button"
                  className="hf-support-link"
                  onClick={() => openUrl('https://discord.gg/nw9TzCwUhx')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  Discord
                </button>
                <button
                  type="button"
                  className="hf-support-link"
                  onClick={() => openUrl('https://t.me/SWIPEONBASE')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.01-.033.02-.149-.056-.22s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                  Telegram
                </button>
                <button
                  type="button"
                  className="hf-support-link"
                  onClick={() => openUrl('https://x.com/swipe_ai_')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  X
                </button>
              </div>
            </div>
          </section>

        </main>

        <footer className="hf-footer">
          <p className="hf-footer-note">
            Parimutuel prediction markets on Base · contracts under BUSL-1.1
          </p>
          <div className="hf-footer-links">
            <button
              type="button"
              className="hf-footer-link"
              onClick={() => openUrl(window.location.origin + '/')}
            >
              Back to Swipe
            </button>
            <button
              type="button"
              className="hf-footer-link"
              onClick={() => openUrl(window.location.origin + '/manifesto')}
            >
              Manifesto
            </button>
          </div>
        </footer>

      </div>
    </div>
  );
}
