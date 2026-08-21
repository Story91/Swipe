'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { erc20Abi, formatEther, formatUnits, parseEther } from 'viem';
import { CHAINS } from '@/lib/chains';
import { getMarketContract } from '@/lib/chains/market';
import { formatAmount, readChainStats, type ChainStats } from '@/lib/chains/chainSummary';
import {
  SWIPE_TOKEN_LAUNCH,
  buyQuote,
  curveProgressBps,
  isSwipeCurve,
  launchpadUrl,
  minTokensOut,
  spotPrice,
} from '@/lib/chains/swipeToken';
import { useSwipeTokenBuy } from '@/lib/chains/useSwipeTokenBuy';
import { SWIPE_TOKEN } from '@/lib/contract';
import './SwipeTokenCard.css';

/**
 * The $SWIPE tab.
 *
 * What this screen used to be, twice over. First a Flaunch buy and sell widget
 * for the Base ERC-20, which described a token the app had stopped using for
 * anything. Then a page that said a Swipe token on Robinhood chain was next and
 * refused to invent a date, a supply or a price for it.
 *
 * That second version has been overtaken. $WIPE exists, on Robinhood chain, at
 * 0xF048...e7B9, launched through the Pons v2 launchpad and still trading on
 * its bonding curve. So the page stops promising and starts reading.
 *
 * The rule that produced the blank version still runs this one: nothing here is
 * written down that can be asked for. Price, supply left, fees, how close the
 * curve is to graduating and whether it has already graduated all come off the
 * curve contract when the page opens and every fifteen seconds after. The only
 * literals are the two addresses and the chain, which is what config is for.
 *
 * BUYING. The curve sells directly, priced against its own reserves, so a buy
 * is one call with native ETH attached and no router in between. The quote in
 * the preview is not an estimate borrowed from an API: lib/chains/swipeToken.ts
 * ports the contract's own arithmetic, which is what lets this screen set a
 * real `minTokensOut` instead of sending zero and hoping. Every send goes
 * through useSwipeTokenBuy, which compares the address before it attaches
 * value, checks the curve sells this exact token, moves the wallet to chain
 * 4663 and pins the id.
 *
 * Motion is deliberate and all of it is CSS, cancelled under
 * prefers-reduced-motion, the way MarketChooserModal and WalletPicker do it.
 */

type Reading =
  | { kind: 'reading' }
  | { kind: 'ready'; stats: ChainStats }
  | { kind: 'unreachable' };

/**
 * The marquee. Decorative and hidden from assistive tech, because every line in
 * it is stated again in the body copy. Nothing in here is a number that moves:
 * a scrolling strip quoting a stale price would be the worst place in the app
 * to put one.
 */
function tickerItems(chainId: number): string[] {
  return [
    `robinhood chain, id ${chainId}`,
    '$wipe trades on a pons curve',
    'you buy it with eth',
    'bets still settle in usdg',
    'buying is not betting',
    'market contracts got there first',
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
      'PredictionMarket_V4 takes every new bet. On Base it holds USDC. On Robinhood chain it holds Paxos USDG. Neither deployment touches a Swipe token at any point.',
  },
  {
    className: 'swipe-token-card__stage swipe-token-card__stage--next',
    when: 'new',
    what: '$WIPE on Robinhood chain',
    text:
      'The market contracts got there first and the token followed. It launched through Pons, so until the curve sells out every buy happens against the contract itself rather than a pool.',
  },
] as const;

/** Preset spends, in ETH. Small on purpose. */
const PRESETS = ['0.001', '0.005', '0.02'] as const;

/** What the slippage picker offers, in basis points. */
const SLIPPAGE = [100, 300, 500] as const;
const DEFAULT_SLIPPAGE = 300;

function short(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

/**
 * A small ETH figure written out rather than in exponent form.
 *
 * One token costs about seven billionths of an ether, and toString gives that
 * as 7.48e-9, which reads on a phone like a chart axis rather than a price.
 */
function formatEthValue(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  const digits = value >= 0.0001 ? 6 : 12;
  const written = value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
  return written === '0' ? value.toExponential(2) : written;
}

/** Whole tokens, grouped, with the fraction dropped rather than rounded up. */
function formatTokens(raw: bigint, decimals: number): string {
  const whole = raw / BigInt(10) ** BigInt(decimals);
  return whole.toLocaleString('en-US');
}

export function SwipeTokenCard() {
  const { address } = useAccount();
  const [attempt, setAttempt] = useState(0);
  const [reading, setReading] = useState<Reading>({ kind: 'reading' });
  const [copied, setCopied] = useState<'legacy' | 'wipe' | null>(null);

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

  const copyAddress = useCallback((which: 'legacy' | 'wipe', value: string) => {
    if (!navigator.clipboard) return;
    void navigator.clipboard
      .writeText(value)
      .then(() => setCopied(which))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1600);
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
          $WIPE is live on Robinhood chain
        </h2>
        <p className="swipe-token-card__standfirst">
          It launched on the Pons family launchpad and still trades on its bonding curve,
          so the price comes off a contract rather than a pool. You can buy it here, with
          ETH, on Robinhood chain. Betting has nothing to do with it. Markets settle in
          USDG and that has not changed.
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

      <SwipeTokenBuyPanel onCopyAddress={copyAddress} copied={copied === 'wipe'} />

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
                <span className="swipe-token-card__dot swipe-token-card__dot--live" aria-hidden="true" />
                swipe token, live
              </span>
            </div>

            <p className="swipe-token-card__note swipe-token-card__note--quiet">
              Those rows come off the contract when this page opens, not out of a config
              file. Bets on this chain are held in USDG, which is a different contract
              again from the token above.
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
          <button
            type="button"
            className="swipe-token-card__copy"
            onClick={() => copyAddress('legacy', SWIPE_TOKEN.address)}
          >
            {copied === 'legacy' ? 'copied' : 'copy address'}
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
          This is a different token from the one above, on a different chain, and one does
          not convert into the other. Swipe does not buy or sell it for you. Whatever it is
          worth is set on a DEX, and the chart link goes there.
        </p>
      </section>

      <section className="swipe-token-card__panel swipe-token-card__panel--plain">
        <div className="swipe-token-card__panel-head">
          <h3 className="swipe-token-card__panel-title">What buying this does not get you</h3>
        </div>
        <p className="swipe-token-card__note">
          It is not collateral. Bets are held in USDG on Robinhood chain and USDC on Base,
          and no market has ever touched a Swipe token. Holding $WIPE gives no allocation,
          no fee share, no discount and no claim on anything in the app. The price is
          whatever the curve says, it moves on every buy anyone makes, and it can go to
          zero. When the curve sells its allocation out it graduates, and the buy box on
          this page stops working.
        </p>
      </section>
    </div>
  );
}

/**
 * The live curve, and the buy.
 *
 * Split out because it holds all the state that moves and the card around it
 * holds none. Every number rendered here is a reading; the only thing this
 * component computes is the quote, and it computes that with the contract's own
 * arithmetic so the floor it sends is one the contract will accept.
 */
function SwipeTokenBuyPanel({
  onCopyAddress,
  copied,
}: {
  onCopyAddress: (which: 'legacy' | 'wipe', value: string) => void;
  copied: boolean;
}) {
  const { address } = useAccount();
  const { launch, curve, status, reading, mismatch, wrongNetwork, ethBalance, tokenBalance, buy, refresh } =
    useSwipeTokenBuy();

  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);
  const [sending, setSending] = useState(false);

  const { isSuccess: confirmed, isError: failed } = useWaitForTransactionReceipt({
    hash: hash ?? undefined,
    chainId: launch.chainId,
    query: { enabled: Boolean(hash) },
  });

  useEffect(() => {
    if (!confirmed) return;
    // The curve moved, and so did the balance. Both are reads, so both have to
    // be asked again rather than adjusted locally.
    refresh();
    setAmount('');
  }, [confirmed, refresh]);

  // Offered ETH, in wei. Null while the box holds something that is not a
  // number, which includes the empty string.
  const offer = useMemo(() => {
    const trimmed = amount.trim();
    if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return null;
    try {
      const wei = parseEther(trimmed as `${number}`);
      return wei > BigInt(0) ? wei : null;
    } catch {
      return null;
    }
  }, [amount]);

  const quote = useMemo(() => {
    if (!reading || offer === null) return null;
    return buyQuote({
      offer,
      quoteReserve: reading.quoteReserve,
      tokenReserve: reading.tokenReserve,
      sellable: reading.sellable,
      feeBps: reading.feeBps,
      creatorTaxBps: reading.creatorTaxBps,
      snipeTaxBps: reading.snipeTaxBps,
      graduated: reading.graduated,
    });
  }, [reading, offer]);

  const notEnough = Boolean(offer !== null && ethBalance !== null && offer > ethBalance);

  const handleBuy = useCallback(async () => {
    setError(null);
    setHash(null);

    // The address this panel is about to attach ETH to, named once and refused
    // unless it is the curve for this token. useSwipeTokenBuy re-checks it at
    // send time as well; this copy keeps the refusal a sentence on the panel
    // rather than a throw out of the wallet.
    const target = curve?.address ?? null;
    if (!curve || !isSwipeCurve(launch.chainKey, target)) {
      setError('Refusing to send: that contract is not the curve for this token.');
      return;
    }
    if (mismatch) {
      setError('Refusing to send: that curve does not sell this token.');
      return;
    }
    if (!quote || offer === null) {
      setError(`Enter an amount of ${launch.quoteSymbol} to spend.`);
      return;
    }
    if (quote.refusal) {
      setError(quote.refusal);
      return;
    }
    if (notEnough) {
      setError(`Not enough ${launch.quoteSymbol} on ${CHAINS.robinhood.label} chain for that.`);
      return;
    }

    setSending(true);
    try {
      const sent = await buy({ spend: offer, floor: minTokensOut(quote.tokensOut, slippageBps) });
      setHash(sent);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The buy was not sent.');
    } finally {
      setSending(false);
    }
  }, [curve, launch, mismatch, quote, offer, notEnough, buy, slippageBps]);

  const price =
    reading && spotPrice(reading.quoteReserve, reading.tokenReserve, launch.decimals, launch.quoteDecimals);
  const progress = reading ? curveProgressBps(reading.realQuoteReserve, reading.graduationThreshold) : 0;

  return (
    <section className="swipe-token-card__panel">
      <div className="swipe-token-card__panel-head">
        <h3 className="swipe-token-card__panel-title">
          ${launch.symbol} on {CHAINS.robinhood.label} chain
        </h3>
      </div>

      {status === 'missing' && (
        <p className="swipe-token-card__status">
          This build has no curve address, so there is nothing here to buy from.
        </p>
      )}

      {status === 'reading' && <p className="swipe-token-card__status">Reading the curve</p>}

      {status === 'unreachable' && (
        <div className="swipe-token-card__status">
          <p className="swipe-token-card__note">
            The curve did not answer. Nothing is wrong with your wallet, and a price worth
            guessing is worth less than an empty row.
          </p>
          <button type="button" className="swipe-token-card__retry" onClick={refresh}>
            Try again
          </button>
        </div>
      )}

      {mismatch && (
        <p className="swipe-token-card__note">
          The curve this build points at sells a different token, so buying is switched
          off. That is a configuration error, not a market condition.
        </p>
      )}

      {status === 'ready' && reading && (
        <>
          <dl className="swipe-token-card__rows">
            <Row
              label="token"
              value={short(launch.token)}
              href={`${launch.explorer}/token/${launch.token}`}
            />
            <Row
              label="curve"
              value={short(launch.curve)}
              href={`${launch.explorer}/address/${launch.curve}`}
            />
            <Row label="launchpad" value={launch.launchpad} href={launchpadUrl()} />
            <Row
              label="price now"
              value={`${formatEthValue(price || 0)} ${launch.quoteSymbol}`}
            />
            <Row
              label="left on the curve"
              value={`${formatTokens(reading.sellable, launch.decimals)} ${launch.symbol}`}
            />
            <Row
              label="raised so far"
              value={`${formatEthValue(Number(formatEther(reading.realQuoteReserve)))} of ${formatEthValue(Number(formatEther(reading.graduationThreshold)))} ${launch.quoteSymbol}`}
            />
            <Row label="curve filled" value={`${(progress / 100).toFixed(1)}%`} />
            <Row
              label="fees on the way in"
              value={`${Number(reading.feeBps) / 100}% curve, ${Number(reading.creatorTaxBps) / 100}% creator`}
            />
          </dl>

          {reading.graduated ? (
            <p className="swipe-token-card__note">
              This curve has graduated. It no longer sells the token, so the buy box is
              gone and trading has moved off it.
            </p>
          ) : (
            <div className="swipe-token-card__buy">
              <label className="swipe-token-card__buy-label" htmlFor="wipe-amount">
                spend, in {launch.quoteSymbol}
              </label>
              <input
                id="wipe-amount"
                className="swipe-token-card__buy-input"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />

              <div className="swipe-token-card__buy-presets">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="swipe-token-card__chip"
                    onClick={() => setAmount(preset)}
                  >
                    {preset}
                  </button>
                ))}
                {address && ethBalance !== null && (
                  <span className="swipe-token-card__buy-balance">
                    you hold {formatEthValue(Number(formatEther(ethBalance)))} {launch.quoteSymbol}
                  </span>
                )}
              </div>

              <div className="swipe-token-card__buy-presets">
                <span className="swipe-token-card__buy-balance">slippage</span>
                {SLIPPAGE.map((bps) => (
                  <button
                    key={bps}
                    type="button"
                    className={
                      bps === slippageBps
                        ? 'swipe-token-card__chip swipe-token-card__chip--on'
                        : 'swipe-token-card__chip'
                    }
                    onClick={() => setSlippageBps(bps)}
                  >
                    {bps / 100}%
                  </button>
                ))}
              </div>

              {quote && !quote.refusal && (
                <dl className="swipe-token-card__rows">
                  <Row
                    label="you get, about"
                    value={`${formatTokens(quote.tokensOut, launch.decimals)} ${launch.symbol}`}
                  />
                  <Row
                    label="least you accept"
                    value={`${formatTokens(minTokensOut(quote.tokensOut, slippageBps), launch.decimals)} ${launch.symbol}`}
                  />
                  {quote.clamped && (
                    <Row
                      label="sent back"
                      value={`${formatEthValue(Number(formatEther(quote.refund)))} ${launch.quoteSymbol}`}
                    />
                  )}
                </dl>
              )}

              {quote?.clamped && (
                <p className="swipe-token-card__note swipe-token-card__note--quiet">
                  That is more than the curve has left. It fills what it can, charges you
                  for that much and returns the rest in the same transaction.
                </p>
              )}

              <button
                type="button"
                className="swipe-token-card__buy-go"
                onClick={handleBuy}
                disabled={!address || sending || !quote || Boolean(quote.refusal) || notEnough || mismatch}
              >
                {sending
                  ? 'check your wallet'
                  : !address
                    ? 'connect a wallet first'
                    : `buy $${launch.symbol}`}
              </button>

              {wrongNetwork && (
                <p className="swipe-token-card__note swipe-token-card__note--quiet">
                  Your wallet is on another network. Buying will ask it to move to{' '}
                  {CHAINS.robinhood.label} chain first.
                </p>
              )}

              {quote?.refusal && offer !== null && (
                <p className="swipe-token-card__note">{quote.refusal}</p>
              )}

              {notEnough && (
                <p className="swipe-token-card__note">
                  Not enough {launch.quoteSymbol} on {CHAINS.robinhood.label} chain. Gas comes
                  out of the same balance, so leave a little behind.
                </p>
              )}

              {error && <p className="swipe-token-card__note">{error}</p>}

              {hash && (
                <p className="swipe-token-card__note swipe-token-card__note--quiet">
                  {confirmed ? 'Bought. ' : failed ? 'That transaction failed. ' : 'Sent. '}
                  <a
                    className="swipe-token-card__link"
                    href={`${launch.explorer}/tx/${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {short(hash)}
                  </a>
                </p>
              )}
            </div>
          )}

          {address && tokenBalance !== null && (
            <div className="swipe-token-card__balance">
              <span className="swipe-token-card__balance-label">your ${launch.symbol}</span>
              <span className="swipe-token-card__balance-value">
                {formatTokens(tokenBalance, launch.decimals)} {launch.symbol}
              </span>
            </div>
          )}

          <div className="swipe-token-card__links">
            <button
              type="button"
              className="swipe-token-card__copy"
              onClick={() => onCopyAddress('wipe', launch.token)}
            >
              {copied ? 'copied' : 'copy token address'}
            </button>
            <a
              className="swipe-token-card__link"
              href={launchpadUrl()}
              target="_blank"
              rel="noopener noreferrer"
            >
              this launch on {launch.launchpad}
            </a>
          </div>

          <p className="swipe-token-card__note swipe-token-card__note--quiet">
            Every row above is read off the curve and refreshed while this page is open.
            The preview runs the contract's own arithmetic on that reading, so the floor
            that travels with your transaction is a real number rather than a guess. If
            somebody moves the curve ahead of you and the fill lands outside the slippage
            you picked, the buy refuses instead of going through at a worse price.
          </p>
        </>
      )}
    </section>
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
