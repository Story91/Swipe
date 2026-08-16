'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import sdk from '@farcaster/miniapp-sdk';
import './WalletPicker.css';

/**
 * Wallet chooser.
 *
 * OnchainKit's <ConnectWallet> connects with a single connector rather than
 * offering a choice, which is why the app appeared to support Coinbase Smart
 * Wallet only. This lists every connector registered in wagmi.ts.
 */

/** Friendlier labels than the raw connector ids, which are inconsistent. */
const LABELS: Record<string, string> = {
  'farcaster-frame': 'Farcaster',
  baseAccount: 'Base Account',
  injected: 'Browser wallet',
  coinbaseWalletSDK: 'Coinbase Wallet',
  walletConnect: 'WalletConnect',
  metaMask: 'MetaMask',
  'io.metamask': 'MetaMask',
  safe: 'Safe',
};

const ICONS: Record<string, string> = {
  'farcaster-frame': '🟣',
  baseAccount: '🔷',
  injected: '🦊',
  coinbaseWalletSDK: '🔵',
  walletConnect: '🔗',
  metaMask: '🦊',
  'io.metamask': '🦊',
  safe: '🔐',
};

function label(id: string, name: string): string {
  return LABELS[id] ?? name ?? id;
}

export function WalletPicker() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // A menu that only closes by picking something from it feels stuck. Escape
  // and a click outside both dismiss it, which is what every other menu in the
  // app and the OS does.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Read after mount, never during render: on the server there is no Farcaster
  // provider, so deciding this inline would make the first client render
  // disagree with the server's inside Warpcast.
  const [hasFarcasterProvider, setHasFarcasterProvider] = useState(false);
  useEffect(() => {
    setHasFarcasterProvider(Boolean(sdk.wallet?.ethProvider));
  }, []);

  /*
   * Which connectors to offer.
   *
   * The Farcaster connector is the only one that is genuinely inert outside its
   * host: its target() returns undefined with no frame provider, so the entry
   * would open nothing and look broken. Everything else is offered.
   *
   * The previous filter here read `c.type !== 'injected' || c.id === 'injected'`,
   * which despite its comment did not test availability at all — it dropped
   * every injected connector whose id was not literally 'injected'. That is
   * exactly the set wagmi discovers over EIP-6963, so MetaMask and every other
   * announced browser wallet were being hidden. That is why the app only ever
   * connected Coinbase.
   *
   * Discovery can announce a wallet that is also present as the generic
   * 'injected' entry, so ids are deduplicated to avoid listing it twice.
   */
  const available = useMemo(() => {
    const seen = new Set<string>();
    return connectors.filter((c) => {
      if (c.id === 'farcaster-frame' && !hasFarcasterProvider) return false;
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [connectors, hasFarcasterProvider]);

  // Below every hook, so the early return cannot change how many run.
  if (isConnected && address) {
    return (
      <button
        type="button"
        className="wallet-picker__connected"
        onClick={() => disconnect()}
        title="Disconnect"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  return (
    <div className="wallet-picker" ref={rootRef}>
      <button
        type="button"
        className="wallet-picker__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={isPending}
      >
        {/* "Sign In" is what this button has always said. The picker changes
            what happens after the click, not what the user is looking for. */}
        {isPending ? 'Connecting…' : 'Sign In'}
      </button>

      {open && (
        <div className="wallet-picker__menu" role="menu">
          {available.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              role="menuitem"
              className="wallet-picker__option"
              onClick={() => {
                connect({ connector });
                setOpen(false);
              }}
            >
              <span aria-hidden="true">{ICONS[connector.id] ?? '👛'}</span>
              {label(connector.id, connector.name)}
            </button>
          ))}
          {available.length === 0 && (
            <p className="wallet-picker__empty">No wallet connectors available.</p>
          )}
        </div>
      )}

      {error && <p className="wallet-picker__error">{error.message}</p>}
    </div>
  );
}

export default WalletPicker;
