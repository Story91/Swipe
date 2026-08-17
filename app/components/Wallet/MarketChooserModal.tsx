'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  chainOptions,
  formatAmount,
  formatBps,
  readChainStats,
  selectChain,
  type ChainOption,
  type ChainStats,
} from '@/lib/chains/chainSummary';
import { useActiveChain } from '@/lib/chains/activeChain';
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
        <span
          className={`chain-switcher__dot${option.selectable ? '' : ' chain-switcher__dot--archived'}`}
          aria-hidden="true"
        />
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

      {option.selectable && state.status === 'ready' && (
        <dl className="market-chooser__stats">
          <Row label="collateral" value={state.stats.collateral.symbol} />
          {connected && (
            <Row
              label="your balance"
              value={
                state.stats.balance === null
                  ? 'unknown'
                  : `${formatAmount(state.stats.balance, state.stats.collateral.decimals, 2)} ${state.stats.collateral.symbol}`
              }
            />
          )}
          <Row
            label="markets registered"
            value={
              state.stats.marketCount === null
                ? 'unknown'
                : `${state.stats.marketCount}${state.stats.countIsFloor ? '+' : ''}`
            }
          />
          <Row label="platform fee" value={formatBps(state.stats.fees.platformBps)} />
          <Row label="creator fee" value={formatBps(state.stats.fees.creatorBps)} />
          <Row label="early exit fee" value={formatBps(state.stats.fees.earlyExitBps)} />
          <Row
            label="minimum bet"
            value={`${formatAmount(state.stats.minBet, state.stats.collateral.decimals)} ${state.stats.collateral.symbol}`}
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

function Row({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="market-chooser__row">
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default MarketChooserModal;
