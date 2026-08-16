'use client';

import React, { useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
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
  injected: 'Browser wallet',
  coinbaseWalletSDK: 'Coinbase Wallet',
  walletConnect: 'WalletConnect',
  metaMask: 'MetaMask',
  safe: 'Safe',
};

const ICONS: Record<string, string> = {
  'farcaster-frame': '🟣',
  injected: '🦊',
  coinbaseWalletSDK: '🔵',
  walletConnect: '🔗',
  metaMask: '🦊',
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

  // A connector whose wallet is not present should not be offered: clicking it
  // opens nothing and looks broken.
  const available = connectors.filter((c) => c.type !== 'injected' || c.id === 'injected');

  return (
    <div className="wallet-picker">
      <button
        type="button"
        className="wallet-picker__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={isPending}
      >
        {isPending ? 'Connecting…' : 'Connect wallet'}
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
