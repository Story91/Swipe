'use client';

import React from 'react';

/**
 * Brand marks for the wallet picker.
 *
 * Wallets discovered over EIP-6963 announce their own icon, and wagmi exposes it
 * as `connector.icon` — MetaMask arrives that way, which is why it was the only
 * entry that looked right while the rest were emoji stand-ins. These fill in for
 * the connectors that announce nothing.
 *
 * Drawn inline rather than fetched: the picker must render with no network round
 * trip, and remote logo URLs would leak which wallets a visitor is offered.
 */

const SIZE = 20;

function Frame({ children, fill }: { children: React.ReactNode; fill: string }) {
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none', display: 'block' }}
    >
      <circle cx="16" cy="16" r="16" fill={fill} />
      {children}
    </svg>
  );
}

/** Base — blue disc with the squared-off notch of the Base mark. */
function BaseIcon() {
  return (
    <Frame fill="#0052FF">
      <path
        d="M16 6c5.5 0 10 4.5 10 10s-4.5 10-10 10c-5.2 0-9.5-4-9.96-9.1h13.2v-1.8H6.04C6.5 10 10.8 6 16 6Z"
        fill="#fff"
      />
    </Frame>
  );
}

/** Coinbase Wallet — blue disc, white rounded square. */
function CoinbaseIcon() {
  return (
    <Frame fill="#0052FF">
      <rect x="11" y="11" width="10" height="10" rx="2.6" fill="#fff" />
    </Frame>
  );
}

/** WalletConnect — the two signal arcs over its blue. */
function WalletConnectIcon() {
  return (
    <Frame fill="#3B99FC">
      <path
        d="M10.2 13.4a8.2 8.2 0 0 1 11.6 0l.4.4a.6.6 0 0 1 0 .84l-1.3 1.3a.3.3 0 0 1-.42 0l-.55-.54a5.7 5.7 0 0 0-8.06 0l-.6.58a.3.3 0 0 1-.42 0l-1.3-1.3a.6.6 0 0 1 0-.84l.65-.44Z"
        fill="#fff"
      />
      <path
        d="M23.9 15.5l1.16 1.15a.6.6 0 0 1 0 .84l-5.2 5.1a.6.6 0 0 1-.84 0l-3.02-2.96Zm-8.9 4.13l-3.02 2.96a.6.6 0 0 1-.84 0l-5.2-5.1a.6.6 0 0 1 0-.84L7.1 15.5Z"
        fill="#fff"
      />
    </Frame>
  );
}

/** Farcaster — the arch, in its purple. */
function FarcasterIcon() {
  return (
    <Frame fill="#855DCD">
      <path
        d="M10 9h12v2.6h-1.5V23H22v2h-5.4v-2h1.3v-5.1a2.9 2.9 0 0 0-5.8 0V23h1.3v2H8v-2h1.5V11.6H10Z"
        fill="#fff"
      />
    </Frame>
  );
}

/** Anything that announces nothing: a plain wallet, not an emoji. */
function GenericIcon() {
  return (
    <Frame fill="#2a2a2a">
      <rect x="7" y="10" width="18" height="12" rx="2.4" fill="none" stroke="#d4ff00" strokeWidth="1.8" />
      <path d="M7 14h18" stroke="#d4ff00" strokeWidth="1.8" />
      <circle cx="20.5" cy="18" r="1.5" fill="#d4ff00" />
    </Frame>
  );
}

const BY_ID: Record<string, () => React.ReactElement> = {
  baseAccount: BaseIcon,
  coinbaseWalletSDK: CoinbaseIcon,
  coinbaseWallet: CoinbaseIcon,
  walletConnect: WalletConnectIcon,
  'farcaster-frame': FarcasterIcon,
};

/**
 * The connector's own announced icon when it has one, otherwise our mark.
 * `icon` is a data URI for EIP-6963 wallets, so no request leaves the page.
 */
export function WalletIcon({ id, icon }: { id: string; icon?: string }) {
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        width={SIZE}
        height={SIZE}
        style={{ flex: 'none', display: 'block', borderRadius: 6 }}
      />
    );
  }

  const Mark = BY_ID[id] ?? GenericIcon;
  return <Mark />;
}

export default WalletIcon;
