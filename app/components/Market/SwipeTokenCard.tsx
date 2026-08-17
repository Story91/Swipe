'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import { CHAINS } from '@/lib/chains';
import { getMarketContract } from '@/lib/chains/market';
import { formatAmount, readChainStats, type ChainStats } from '@/lib/chains/chainSummary';
import { SWIPE_TOKEN } from '@/lib/contract';
import './SwipeTokenCard.css';

/**
 * The $SWIPE tab.
 *
 * What this screen used to be: a Flaunch buy and sell widget for the Base
 * ERC-20, with quick-buy tiles, a slippage picker and a fee-split banner. Every
 * part of that described a token the app no longer uses for anything. Bets go
 * through PredictionMarket_V4 and settle in the chain's stablecoin, USDC on
 * Base and Paxos USDG on Robinhood, so the old token is not collateral, not a
 * reward and not a fee. Selling it back to people from inside the app was the
 * one thing this page had no business doing.
 *
 * What it is now: one story in three moves. The old token is the past, V4 is
 * the present, and a Swipe token on Robinhood chain is what comes next.
 *
 * The hard rule here is that nothing about the new token may be invented. There
 * is no date, no supply, no price and no ticker beyond the name, so this page
 * prints none of those and says out loud that it will not. A countdown to a
 * date nobody has committed to would be worse than a blank screen, because a
 * blank screen cannot be quoted back at you.
 *
 * Everything numeric on the Robinhood panel is read off the contract when the
 * page opens, through the same readChainStats the market chooser uses. A panel
 * that recited lib/chains would keep insisting the market is live long after it
 * stopped answering, and "the contracts are already there" is exactly the claim
 * this page leans on.
 *
 * Motion is deliberate and all of it is CSS. The newest components in this repo
 * do not pull framer-motion, and every animation here is cancelled under
 * prefers-reduced-motion, which MarketChooserModal and WalletPicker both treat
 * as a house rule.
 */

type Reading =
  | { kind: 'reading' }
  | { kind: 'ready'; stats: ChainStats }
  | { kind: 'unreachable' };

/**
 * The marquee. Decorative and hidden from assistive tech, because every line in
 * it is stated again in the body copy, but still true: a scrolling strip of
 * invented facts would be the worst possible place to put them.
 */
function tickerItems(chainId: number): string[] {
  return [
    `robinhood chain, id ${chainId}`,
    'market contracts already there',
    'collateral is usdg',
    'betting does not use $swipe',
    'the token is next',
    'no date announced',
  ];
}

const STAGES = [
  {
    className: 'swipe-token-card__stage swipe-token-card__stage--was',
    when: 'was',
    what: '$SWIPE on Base',
    text:
      'The old ERC-20 is still on chain and still yours. It backs nothing now. The contracts that used to hold it are archived under a key nobody has, so a position left inside one can never be settled.',
  },
  {
    className: 'swipe-token-card__stage swipe-token-card__stage--now',
    when: 'now',
    what: 'V4, settled in stablecoins',
    text:
      'PredictionMarket_V4 takes every new bet. On Base it holds USDC. On Robinhood chain it holds Paxos USDG. Neither deployment touches $SWIPE at any point.',
  },
  {
    className: 'swipe-token-card__stage swipe-token-card__stage--next',
    when: 'next',
    what: 'A Swipe token on Robinhood chain',
    text:
      'The market contracts got there first. The token follows. That is the whole of what has been decided, so it is the whole of what this page says.',
  },
] as const;

function short(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function SwipeTokenCard() {
  const { address } = useAccount();
  const [attempt, setAttempt] = useState(0);
  const [reading, setReading] = useState<Reading>({ kind: 'reading' });
  const [copied, setCopied] = useState(false);

  // Resolved once. Rebuilding it every render would restart the read below on
  // every keystroke anywhere in the tree.
  const market = useMemo(() => getMarketContract('robinhood'), []);

  useEffect(() => {
    if (!market) return;
    let cancelled = false;
    setReading({ kind: 'reading' });

    readChainStats('robinhood')
      .then((stats) => {
        if (!cancelled) setReading({ kind: 'ready', stats });
      })
      .catch(() => {
        if (!cancelled) setReading({ kind: 'unreachable' });
      });

    return () => {
      cancelled = true;
    };
  }, [market, attempt]);

  // Pinned to Base. Without chainId this reads balanceOf at the Base token's
  // address on whatever chain the wallet happens to be on, which on Robinhood
  // is either nothing or somebody else's contract.
  const { data: legacyBalance } = useReadContract({
    address: SWIPE_TOKEN.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAINS.base.viemChain.id,
    query: { enabled: Boolean(address) },
  });

  const copyAddress = useCallback(() => {
    if (!navigator.clipboard) return;
    void navigator.clipboard
      .writeText(SWIPE_TOKEN.address)
      .then(() => setCopied(true))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const items = tickerItems(market?.chainId ?? CHAINS.robinhood.viemChain.id);
  const held =
    legacyBalance === undefined
      ? null
      : Number(formatUnits(legacyBalance as bigint, SWIPE_TOKEN.decimals));

  return (
    <div className="swipe-token-card">
      <header className="swipe-token-card__hero">
        <span className="swipe-token-card__beam" aria-hidden="true" />
        <span className="swipe-token-card__eyebrow">Swipe token</span>
        <h2 className="swipe-token-card__headline">
          A Swipe token on Robinhood chain is what comes next
        </h2>
        <p className="swipe-token-card__standfirst">
          The old $SWIPE on Base is finished as a betting token. Markets settle in the
          stablecoin of whichever chain they run on, and the contracts on Robinhood chain
          are already running. The token there has no date. This page will not invent one.
        </p>
      </header>

      <div className="swipe-token-card__ticker" aria-hidden="true">
        {/* Duplicated once, because the loop translates the track by exactly half
            its width and any other ratio shows a seam. */}
        <div className="swipe-token-card__ticker-track">
          {[...items, ...items].map((item, index) => (
            <span className="swipe-token-card__ticker-item" key={`${item}-${index}`}>
              {item}
            </span>
          ))}
        </div>
      </div>

      <ol className="swipe-token-card__relay">
        {STAGES.map((stage) => (
          <li className={stage.className} key={stage.when}>
            <span className="swipe-token-card__stage-rail" aria-hidden="true">
              <span className="swipe-token-card__stage-node" />
            </span>
            <div className="swipe-token-card__stage-body">
              <span className="swipe-token-card__stage-when">{stage.when}</span>
              <h3 className="swipe-token-card__stage-what">{stage.what}</h3>
              <p className="swipe-token-card__stage-text">{stage.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="swipe-token-card__panel">
        <div className="swipe-token-card__panel-head">
          <h3 className="swipe-token-card__panel-title">Robinhood chain today</h3>
        </div>

        {!market && (
          <p className="swipe-token-card__status">
            This build has no Robinhood market address, so there is nothing here to read.
          </p>
        )}

        {market && reading.kind === 'reading' && (
          <p className="swipe-token-card__status">Reading the contract</p>
        )}

        {market && reading.kind === 'unreachable' && (
          <div className="swipe-token-card__status">
            <p className="swipe-token-card__note">
              Robinhood chain did not answer. Nothing is wrong with your wallet, and the
              numbers are worth more empty than guessed.
            </p>
            <button
              type="button"
              className="swipe-token-card__retry"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {market && reading.kind === 'ready' && (
          <>
            <dl className="swipe-token-card__rows">
              <Row label="network" value={`${CHAINS.robinhood.label} chain, id ${market.chainId}`} />
              <Row
                label="market contract"
                value={short(market.address)}
                href={`${market.explorer}/address/${market.address}`}
              />
              <Row label="collateral" value={reading.stats.collateral.symbol} />
              <Row
                label="markets registered"
                value={
                  reading.stats.marketCount === null
                    ? 'unknown'
                    : `${reading.stats.marketCount}${reading.stats.countIsFloor ? '+' : ''}`
                }
              />
              <Row
                label="minimum bet"
                value={`${formatAmount(reading.stats.minBet, reading.stats.collateral.decimals)} ${reading.stats.collateral.symbol}`}
              />
            </dl>

            <div className="swipe-token-card__flags">
              <span className="swipe-token-card__flag">
                <span className="swipe-token-card__dot swipe-token-card__dot--live" aria-hidden="true" />
                market contract, live
              </span>
              <span className="swipe-token-card__flag">
                <span className="swipe-token-card__dot swipe-token-card__dot--idle" aria-hidden="true" />
                swipe token, not yet
              </span>
            </div>

            <p className="swipe-token-card__note swipe-token-card__note--quiet">
              Those rows come off the contract when this page opens, not out of a config
              file. The second flag is the one thing here with no contract to ask.
            </p>
          </>
        )}
      </section>

      <section className="swipe-token-card__panel">
        <div className="swipe-token-card__panel-head">
          <h3 className="swipe-token-card__panel-title">If you still hold the old one</h3>
        </div>

        {address ? (
          <div className="swipe-token-card__balance">
            <span className="swipe-token-card__balance-label">your balance on Base</span>
            <span className="swipe-token-card__balance-value">
              {held === null
                ? 'reading'
                : `${Math.floor(held).toLocaleString()} ${SWIPE_TOKEN.symbol}`}
            </span>
          </div>
        ) : (
          <p className="swipe-token-card__note">
            Connect a wallet and this reads your balance off Base.
          </p>
        )}

        <dl className="swipe-token-card__rows">
          <Row label="token" value={short(SWIPE_TOKEN.address)} />
          <Row label="chain" value={CHAINS.base.label} />
          <Row label="used for" value="nothing in this app" />
        </dl>

        <div className="swipe-token-card__links">
          <button type="button" className="swipe-token-card__copy" onClick={copyAddress}>
            {copied ? 'copied' : 'copy address'}
          </button>
          <a
            className="swipe-token-card__link"
            href={`${CHAINS.base.explorer}/token/${SWIPE_TOKEN.address}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            contract on Basescan
          </a>
          <a
            className="swipe-token-card__link"
            href={`https://dexscreener.com/base/${SWIPE_TOKEN.address}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            chart on DexScreener
          </a>
        </div>

        <p className="swipe-token-card__note swipe-token-card__note--quiet">
          Swipe does not buy or sell it for you any more. Whatever it is worth is set on a
          DEX, and the chart link goes there.
        </p>
      </section>

      <section className="swipe-token-card__panel swipe-token-card__panel--plain">
        <div className="swipe-token-card__panel-head">
          <h3 className="swipe-token-card__panel-title">What is not on this page</h3>
        </div>
        <p className="swipe-token-card__note">
          No countdown, because no date has been set. Nothing here is for sale and nothing
          here is claimable. No allocation has been promised to anyone. When the new token
          exists it will have an address on chain, and that address is what will turn up
          here.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="swipe-token-card__row">
      <dt className="swipe-token-card__row-key">{label}</dt>
      <dd className="swipe-token-card__row-value">
        {href ? (
          <a className="swipe-token-card__link" href={href} target="_blank" rel="noopener noreferrer">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export default SwipeTokenCard;
