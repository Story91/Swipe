'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CHAINS } from '@/lib/chains';
import { getMarketContract } from '@/lib/chains/market';
import { useActiveChain } from '@/lib/chains/activeChain';
import { formatAmount, formatBps, readChainStats, type ChainStats } from '@/lib/chains/chainSummary';
import './HowToPlayModal.css';

/**
 * How to play.
 *
 * What this used to be: a five-panel Stepper with an emoji headline, two GIFs,
 * and copy claiming you bet with ETH or SWIPE, that a second swipe confirms the
 * bet, and that the platform takes 1% of your profits. Every one of those is
 * false. Bets settle in the chain's stablecoin, the swipe only opens the stake
 * dialog, and the fees are 300 bps plus 50 bps taken from the losing pool, so a
 * winning stake is never shaved. A wizard was also the wrong shape: five
 * screens of one sentence each hide the one rule that actually decides what you
 * are paid, which is when you bet.
 *
 * What it is now: one scrolling sheet, mobile first, in the same visual
 * language as the $SWIPE tab. Four motion devices are borrowed from
 * app/components/Market/SwipeTokenCard.css and used for the same reasons:
 * a lime beam sweeping the hero's top edge, a clipped marquee that cannot push
 * the page sideways, a vertical relay whose connector marches where time has to
 * pass and whose last node breathes, and a status dot that is only claimed
 * after a real read.
 *
 * The fifth device is new and is the point of the screen. A playhead crosses
 * the market clock on a twelve second loop and lights each bracket as it
 * passes, because the time weighting is a rule about a moving deadline and a
 * table of three numbers does not teach it. The third block is deliberately
 * twice as wide: the third and fourth quarters pay the same, so the whole
 * second half is flat at x1.00.
 *
 * The rates panel reads getFeeConfig off the active chain when the dialog
 * opens, the way MarketChooserModal and SwipeTokenCard do. Fees are settable on
 * V4 after deploy, so a panel built from constants would keep saying 3% after
 * somebody calls setPlatformFee. When the chain does not answer the panel says
 * so and labels the deploy configuration as configuration.
 *
 * The worked example carries the same figures as the manifesto and the FAQ,
 * because it is the same settlement. If these three screens disagree the reader
 * is right to trust none of them.
 *
 * No framer-motion. Every animation is cancelled under prefers-reduced-motion.
 */

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Reading =
  | { kind: 'reading' }
  | { kind: 'ready'; stats: ChainStats }
  | { kind: 'unreachable' };

/**
 * The marquee. Decorative and hidden from assistive tech, because every line in
 * it is said again in the body copy underneath.
 */
const TICKER_ITEMS = [
  'right is yes, left is no',
  'usdc on base',
  'paxos usdg on robinhood chain',
  'minimum 0.1, no ceiling',
  'fees come out of the losing pool',
  'early money counts for more',
  'no shares, no counterparty',
];

const STEPS = [
  {
    className: 'htp__step htp__step--act',
    when: 'pick',
    what: 'Swipe right for yes, left for no',
    text:
      'The swipe chooses a side and opens the stake dialog. Nothing has been staked at that point, no amount and no approval, and closing the dialog brings the card back.',
  },
  {
    className: 'htp__step htp__step--act',
    when: 'stake',
    what: 'Set an amount and confirm',
    text:
      "Bets settle in the chain's stablecoin, USDC on Base and Paxos USDG on Robinhood chain. The floor is 0.1 of it and there is no ceiling. Expect two signatures, one approving exactly the amount you are betting, one placing the bet.",
  },
  {
    className: 'htp__step htp__step--wait',
    when: 'wait',
    what: 'The deadline runs down',
    text:
      'Your stake sits in the pool. Change your mind and you can take part of it or all of it out early, but the exit is priced, not refunded: what you get is your amount scaled by the other side of the pool, then 5% off that. Back the crowded side and the exit pays well under what you put in. One catch, in the final quarter you cannot take a side down to exactly zero.',
  },
  {
    className: 'htp__step htp__step--settle',
    when: 'settle',
    what: 'Claim what you won',
    text:
      'A resolver declares the outcome once the deadline has passed. Payouts are pulled rather than pushed and nothing expires, so an unclaimed one waits on the contract.',
  },
] as const;

const BRACKETS = [
  {
    className: 'htp__bracket htp__bracket--first',
    span: 'first quarter',
    weight: 'x1.50',
  },
  {
    className: 'htp__bracket htp__bracket--second',
    span: 'second quarter',
    weight: 'x1.25',
  },
  {
    className: 'htp__bracket htp__bracket--half',
    span: 'second half, both quarters',
    weight: 'x1.00',
  },
] as const;

export function HowToPlayModal({ isOpen, onClose }: HowToPlayModalProps) {
  const { chainKey } = useActiveChain();
  const [attempt, setAttempt] = useState(0);
  const [reading, setReading] = useState<Reading>({ kind: 'reading' });

  // Resolved once per chain. Rebuilt every render it would restart the read
  // below on every keystroke anywhere in the tree.
  const market = useMemo(() => getMarketContract(chainKey), [chainKey]);
  const chainLabel = CHAINS[chainKey].label;

  useEffect(() => {
    if (!isOpen || !market) return;
    let cancelled = false;
    setReading({ kind: 'reading' });

    readChainStats(chainKey)
      .then((stats) => {
        if (!cancelled) setReading({ kind: 'ready', stats });
      })
      .catch(() => {
        if (!cancelled) setReading({ kind: 'unreachable' });
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, market, chainKey, attempt]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="htp">
        <div className="htp__scroll">
          <header className="htp__hero">
            <span className="htp__beam" aria-hidden="true" />
            <span className="htp__eyebrow">How to play</span>
            <DialogTitle className="htp__headline">
              Back a side, split what the other side staked
            </DialogTitle>
            <DialogDescription className="htp__standfirst">
              Swipe is parimutuel. There is no order book and nobody taking the other end
              of your bet. Everyone who says yes puts money in one pot, everyone who says
              no puts money in another, and at the deadline the side that was right divides
              the losing pot and takes its own stake back on top.
            </DialogDescription>
          </header>

          <div className="htp__ticker" aria-hidden="true">
            {/* Duplicated once, because the loop translates the track by exactly
                half its width and any other ratio shows a seam. */}
            <div className="htp__ticker-track">
              {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, index) => (
                <span className="htp__ticker-item" key={`${item}-${index}`}>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <section className="htp__panel">
            <h3 className="htp__panel-title">One bet, start to finish</h3>
            <ol className="htp__relay">
              {STEPS.map((step) => (
                <li className={step.className} key={step.when}>
                  <span className="htp__step-rail" aria-hidden="true">
                    <span className="htp__step-node" />
                  </span>
                  <div className="htp__step-body">
                    <span className="htp__step-when">{step.when}</span>
                    <h4 className="htp__step-what">{step.what}</h4>
                    <p className="htp__step-text">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="htp__panel htp__panel--accent">
            <h3 className="htp__panel-title">When you bet changes what it counts for</h3>

            <div className="htp__clock">
              <div className="htp__clock-bar">
                {BRACKETS.map((bracket) => (
                  <div className={bracket.className} key={bracket.span}>
                    <span className="htp__bracket-weight">{bracket.weight}</span>
                    <span className="htp__bracket-span">{bracket.span}</span>
                  </div>
                ))}
                <span className="htp__playhead" aria-hidden="true" />
              </div>
              <div className="htp__clock-ends" aria-hidden="true">
                <span className="htp__clock-end">market opens</span>
                <span className="htp__clock-end">deadline</span>
              </div>
            </div>

            <p className="htp__text">
              A stake is multiplied by the bracket it lands in, and the multiplier is fixed
              the moment you bet. It cannot change afterwards and it never touches your own
              money. All it decides is how large a share of the losing pool you take.
            </p>
            <p className="htp__text htp__text--quiet">
              The third block is twice as wide on purpose. The third and fourth quarters pay
              exactly the same, so the whole second half is flat at x1.00, and a bet placed
              one minute before the deadline counts for as much as one placed at halfway.
            </p>
          </section>

          <section className="htp__panel">
            <h3 className="htp__panel-title">One settlement, worked through</h3>
            <p className="htp__text">
              Say the losing side staked 1000. Fees take 3.5% of that and leave 965 for the
              winners to divide.
            </p>

            <dl className="htp__rows">
              <Row label="losing pool" value="1000.00" />
              <Row label="platform fee, 3%" value="-30.00" />
              <Row label="creator fee, 0.5%" value="-5.00" />
              <Row label="to the winners" value="965.00" />
            </dl>

            <div className="htp__splits">
              <div className="htp__split">
                <div className="htp__split-head">
                  <span className="htp__split-who">Alice</span>
                  <span className="htp__split-take">321.67</span>
                </div>
                <div className="htp__split-track">
                  <span className="htp__split-fill htp__split-fill--alice" />
                </div>
                <p className="htp__split-note">
                  staked 100 in the first quarter, x1.50, so a weighted 150
                </p>
              </div>

              <div className="htp__split">
                <div className="htp__split-head">
                  <span className="htp__split-who">Ben</span>
                  <span className="htp__split-take">643.33</span>
                </div>
                <div className="htp__split-track">
                  <span className="htp__split-fill htp__split-fill--ben" />
                </div>
                <p className="htp__split-note">
                  staked 300 later, x1.00, so a weighted 300
                </p>
              </div>
            </div>

            <p className="htp__text htp__text--quiet">
              The weighted winning pool is 450. Alice holds 150 of it and takes 150/450 of
              965, Ben holds 300 and takes the rest. Both get their original stake back
              whole on top, because the fees came out of the losing side.
            </p>
          </section>

          <section className="htp__panel">
            <h3 className="htp__panel-title">The numbers, read off the contract</h3>

            {!market && (
              <p className="htp__status">
                This build has no market address for {chainLabel}, so there is nothing here
                to read.
              </p>
            )}

            {market && reading.kind === 'reading' && (
              <p className="htp__status">Reading the contract</p>
            )}

            {market && reading.kind === 'unreachable' && (
              <div className="htp__status">
                <div className="htp__flags">
                  <span className="htp__flag">
                    <span className="htp__dot htp__dot--idle" aria-hidden="true" />
                    not read
                  </span>
                </div>
                <p className="htp__text">
                  {chainLabel} did not answer, so these rows would be a guess. Every Swipe
                  market is deployed with a 3% platform fee, 0.5% to the creator, 5% to exit
                  early and a floor of 0.1, but that is the deploy configuration and not this
                  chain&apos;s own answer.
                </p>
                <button
                  type="button"
                  className="htp__retry"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  Try again
                </button>
              </div>
            )}

            {market && reading.kind === 'ready' && (
              <>
                <dl className="htp__rows">
                  <Row
                    label="network"
                    value={`${chainLabel}, chain id ${market.chainId}`}
                  />
                  <Row label="bets settle in" value={reading.stats.collateral.symbol} />
                  <Row
                    label="platform fee, losing pool only"
                    value={formatBps(reading.stats.fees.platformBps)}
                  />
                  <Row
                    label="creator fee, losing pool only"
                    value={formatBps(reading.stats.fees.creatorBps)}
                  />
                  <Row
                    label="early exit fee"
                    value={formatBps(reading.stats.fees.earlyExitBps)}
                  />
                  <Row
                    label="minimum bet"
                    value={`${formatAmount(reading.stats.minBet, reading.stats.collateral.decimals)} ${reading.stats.collateral.symbol}`}
                  />
                  <Row label="maximum bet" value="none" />
                </dl>

                <div className="htp__flags">
                  <span className="htp__flag">
                    <span className="htp__dot htp__dot--live" aria-hidden="true" />
                    read from {chainLabel}
                  </span>
                </div>

                <p className="htp__text htp__text--quiet">
                  Those rows came off the market contract when this dialog opened, not out
                  of a config file. Both fees are charged to the losing pool, so winning
                  never costs you a percentage of your own stake.
                </p>
              </>
            )}
          </section>

          <section className="htp__panel">
            <h3 className="htp__panel-title">Where markets come from</h3>
            <p className="htp__text">
              Anyone with a wallet can propose one and it costs nothing. Write the question
              and set a deadline, then sign a message. The signature is not a transaction,
              it proves the creator address is yours, which matters because that address
              earns the creator fee on every losing pool in the market. A proposal does
              nothing on chain until someone registers it, and one address can send five a
              day.
            </p>
          </section>

          <section className="htp__panel htp__panel--accent">
            <h3 className="htp__panel-title">If nobody settles it</h3>
            <p className="htp__text">
              A market left alone for 30 days past its deadline can be made refundable, and
              anyone at all can open that. Every backer then takes their raw stake back,
              unweighted. It needs no key of ours and no permission, which is the whole
              reason it is in the contract.
            </p>
          </section>
        </div>

        <footer className="htp__footer">
          <button type="button" className="htp__start" onClick={onClose}>
            Start swiping
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="htp__row">
      <dt className="htp__row-key">{label}</dt>
      <dd className="htp__row-value">{value}</dd>
    </div>
  );
}

export default HowToPlayModal;
