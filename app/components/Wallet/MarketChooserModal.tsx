'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  chainOptions,
  formatAmount,
  readChainStats,
  selectChain,
  type ChainOption,
  type ChainStats,
} from '@/lib/chains/chainSummary';
import { useActiveChain } from '@/lib/chains/activeChain';
import { chainMark } from './ChainSwitcher';
import type { ChainKey } from '@/lib/chains/types';
import './MarketChooserModal.css';

/**
 * The market chooser.
 *
 * One card per chain, each describing the deployment on it rather than the
 * config entry for it. Fees can be changed on V3 after deploy and minBet is
 * denominated in a collateral the contract names itself, so a card built from
 * constants goes stale without anyone noticing.
 *
 * The cards read in parallel and fail in isolation. Robinhood's RPC being down
 * leaves Base's card intact, because a chooser that blanks when one network is
 * unreachable tells you nothing about the one that works.
 *
 * A chain with no market deployed is shown and cannot be picked. It is not
 * hidden: people hold positions on chains that stop taking bets, and a network
 * that disappears from the list looks like the app lost it.
 */

type CardState =
  | { status: 'loading' }
  | { status: 'ready'; stats: ChainStats }
  | { status: 'error' };

export interface MarketChooserModalProps {
  open: boolean;
  onClose: () => void;
}

export function MarketChooserModal({ open, onClose }: MarketChooserModalProps) {
  const { chainKey, setChain } = useActiveChain();
  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [switching, setSwitching] = useState<ChainKey | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [cards, setCards] = useState<Record<string, CardState>>({});

  const showTestnets = process.env.NEXT_PUBLIC_SHOW_TESTNETS === 'true';
  const options = useMemo(() => chainOptions(showTestnets), [showTestnets]);

  // Stable dependency for the effect below. `options` is rebuilt on every
  // render, and depending on the array itself would restart every read on every
  // keystroke elsewhere in the tree.
  const readableKeys = options
    .filter((option) => option.selectable)
    .map((option) => option.key)
    .join(',');

  useEffect(() => {
    if (!open) return;
    const keys = readableKeys ? (readableKeys.split(',') as ChainKey[]) : [];
    if (keys.length === 0) return;

    let cancelled = false;
    setCards(Object.fromEntries(keys.map((key) => [key, { status: 'loading' as const }])));

    // Fired together, settled separately. Promise.all here would hold every
    // card at "reading" until the slowest RPC answered, and lose all of them if
    // one refused.
    for (const key of keys) {
      readChainStats(key, { account: address ?? null })
        .then((stats) => {
          if (!cancelled) setCards((prev) => ({ ...prev, [key]: { status: 'ready', stats } }));
        })
        .catch(() => {
          if (!cancelled) setCards((prev) => ({ ...prev, [key]: { status: 'error' } }));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [open, readableKeys, address, attempt]);

  const pick = useCallback(
    async (option: ChainOption) => {
      setSwitching(option.key);
      try {
        const result = await selectChain({
          option,
          current: chainKey,
          isConnected,
          switchChain: switchChainAsync,
          setChain,
        });
        // Closing on 'declined' would hide the fact that nothing changed.
        if (result === 'selected' || result === 'unchanged') onClose();
      } finally {
        setSwitching(null);
      }
    },
    [chainKey, isConnected, switchChainAsync, setChain, onClose]
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="market-chooser">
        <DialogTitle className="market-chooser__title">Choose a network</DialogTitle>
        {/* Radix wants a description for the dialog's accessible name, and the
            one sentence people need here is what a network actually is. */}
        <DialogDescription className="market-chooser__intro">
          Swipe runs the same contract on each network. Each one holds its own markets
          in its own collateral, and nothing moves between them.
        </DialogDescription>

        <div className="market-chooser__cards">
          {options.map((option) => (
            <ChainCard
              key={option.key}
              option={option}
              state={cards[option.key] ?? { status: 'loading' }}
              active={option.key === chainKey}
              connected={isConnected}
              busy={switching === option.key}
              disabled={switching !== null}
              onPick={() => pick(option)}
              onRetry={() => setAttempt((n) => n + 1)}
            />
          ))}
        </div>

        <p className="market-chooser__footnote">
          Picking a network points the app at it and asks your wallet to follow. Every
          bet checks the network again before it is signed.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function ChainCard({
  option,
  state,
  active,
  connected,
  busy,
  disabled,
  onPick,
  onRetry,
}: {
  option: ChainOption;
  state: CardState;
  active: boolean;
  connected: boolean;
  busy: boolean;
  disabled: boolean;
  onPick: () => void;
  onRetry: () => void;
}) {
  const classes = [
    'market-chooser__card',
    active ? 'market-chooser__card--active' : '',
    option.selectable ? '' : 'market-chooser__card--unavailable',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes}>
      <header className="market-chooser__card-head">
        {/* The network's own artwork, the same mark the trigger shows. A
            coloured dot said "this one is selectable" and nothing about which
            network it was, which is the one thing a picker has to answer. */}
        <ChainMark option={option} />
        <h3 className="market-chooser__name">{option.label}</h3>
        {option.testnet && <span className="market-chooser__tag">testnet</span>}
        {active && <span className="market-chooser__tag market-chooser__tag--active">selected</span>}
      </header>

      {!option.selectable && <p className="market-chooser__reason">{option.reason}</p>}

      {option.selectable && state.status === 'loading' && (
        <p className="market-chooser__status">Reading the contract</p>
      )}

      {option.selectable && state.status === 'error' && (
        <div className="market-chooser__status">
          <p>This network did not answer. The others are unaffected.</p>
          <button type="button" className="market-chooser__retry" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {/* Only what differs between the networks, because that is the only thing
          a picker can help you choose with. The platform, creator and early
          exit fees and the minimum bet were four more rows per card and they
          are identical on every deployment, so they answered a question nobody
          was asking here and doubled the height of the dialog doing it. They
          are on the Help page, where a reader is asking about fees. */}
      {option.selectable && state.status === 'ready' && (
        <dl className="market-chooser__stats">
          {connected ? (
            <Row
              label="your balance"
              value={
                state.stats.balance === null
                  ? 'unknown'
                  : `${formatAmount(state.stats.balance, state.stats.collateral.decimals, 2)} ${state.stats.collateral.symbol}`
              }
            />
          ) : (
            <Row label="settles in" value={state.stats.collateral.symbol} />
          )}
          <Row
            label="markets"
            value={
              state.stats.marketCount === null
                ? 'unknown'
                : `${state.stats.marketCount}${state.stats.countIsFloor ? '+' : ''}`
            }
          />
        </dl>
      )}

      <button
        type="button"
        className="market-chooser__pick"
        onClick={onPick}
        // Unselectable is the contract's answer, not a styling choice, so the
        // button refuses rather than looking refused.
        disabled={!option.selectable || active || disabled}
        aria-busy={busy}
      >
        {label(option, active, busy)}
      </button>
    </section>
  );
}

function label(option: ChainOption, active: boolean, busy: boolean): string {
  if (!option.selectable) return 'Not available';
  if (active) return 'Currently selected';
  if (busy) return 'Waiting for your wallet';
  return `Switch to ${option.label}`;
}

/**
 * The network's own logo, from the same source the trigger uses. Falls back to
 * a lettered tile so a chain with no artwork still gets a mark of the same size
 * and the card does not reflow around it.
 */
function ChainMark({ option }: { option: ChainOption }) {
  const mark = chainMark(option.key);
  return (
    <span
      className={`market-chooser__mark${option.selectable ? '' : ' market-chooser__mark--off'}`}
      aria-hidden="true"
    >
      {mark.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mark.src} alt="" width={20} height={20} />
      ) : (
        mark.letter
      )}
    </span>
  );
}

function Row({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="market-chooser__row">
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default MarketChooserModal;
